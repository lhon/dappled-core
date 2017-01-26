from __future__ import print_function

import psutil
import requests
import ruamel.yaml

import collections
import datetime
import os
import json
import subprocess
import sys
from time import sleep
import shutil


def get_exe(path):
    if '/' in path:
        return path.rsplit('/', 1)[-1]
    return path

def get_friendly_name(p):
    name = p.name()
    if name not in ('sh', 'bash', 'java', 'perl') and not name.startswith('python'):
        return name

    try:
        cmdline = p.cmdline()
    except:
        return name
    if len(cmdline) == 1:
        return name
    if len(cmdline) == 2:
        return get_exe(cmdline[1])
    if name in ('sh', 'bash') and cmdline[1] == '-c':
        c = cmdline[2].split()[0]
        if '/' not in c:
            return name # not obvious where the command is inside command line string
        return get_exe(c)
    if name.startswith('python') and cmdline[1] == '-m':
        return cmdline[2]
    if name == 'java':
        try:
            pos = cmdline.index('-jar')
        except:
            pos = -1
        if pos >= 0:
            return get_exe(cmdline[pos+1])
        return name

    return get_exe(cmdline[1])

def bytes2human(n):
    # http://code.activestate.com/recipes/578019
    # >>> bytes2human(10000)
    # '9.8K'
    # >>> bytes2human(100001221)
    # '95.4M'
    symbols = ('K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y')
    prefix = {}
    for i, s in enumerate(symbols):
        prefix[s] = 1 << (i + 1) * 10
    for s in reversed(symbols):
        if n >= prefix[s]:
            value = float(n) / prefix[s]
            return '%.1f%s' % (value, s)
    return "%sB" % n


class ProcessData:
    def __init__(self, pid):
        self.data = {}
        self.parent_process = psutil.Process(pid)
        self.start_time = datetime.datetime.utcnow()
        self.core_seconds = 0.

    def get_update(self, tick_size=0):
        active_processes = []
        now = datetime.datetime.utcnow()
        try:
            iterator = self.parent_process.children(recursive=True)
        except:
            return active_processes

        for p in iterator:
            try:
                rss = p.memory_info().rss
                c = p.cpu_times()
                cpu_percent = p.cpu_percent()
            except:
                continue # process is gone

            pid = p.pid
            if pid not in self.data:
                self.data[pid] = dict(
                    name=get_friendly_name(p),
                    max_rss=rss,
                    time=c.user+c.system,
                    start=now.strftime("%Y-%m-%dT%H:%M:%S"),
                    end=now.strftime("%Y-%m-%dT%H:%M:%S"),
                    cpu_time=0.,
                    )
            else:
                if rss > self.data[pid]['max_rss']:
                    self.data[pid]['max_rss'] = rss
                self.data[pid]['time'] = c.user+c.system
                self.data[pid]['end'] = now.strftime("%Y-%m-%dT%H:%M:%S")

            if cpu_percent > 0:
                info = self.data[pid]
                active_processes.append([info['name'], cpu_percent, bytes2human(rss), pid])

                if tick_size > 0:
                    core_seconds = (cpu_percent/100.) * tick_size
                    self.data[pid]['cpu_time'] += core_seconds
                    self.core_seconds += core_seconds

        return active_processes

    def elapsed_time(self):
        return datetime.datetime.utcnow() - self.start_time

    def as_json_string(self):
        elapsed = self.elapsed_time()
        return json.dumps(dict(
            data=self.data,
            core_seconds = self.core_seconds,
            elapsed_time = elapsed.total_seconds(),
            ))

# Based on https://github.com/six8/pytailer
# and http://aspn.activestate.com/ASPN/Cookbook/Python/Recipe/157035
class Follow:

    def __init__(self, filename):
        self.filename = filename
        self.file = None

    def get_chunk(self):
        if self.file is None:
            if os.path.exists(self.filename):
                self.file = open(self.filename)
            else:
                return ''

        chunk = []
        while 1:
            where = self.file.tell()
            line = self.file.readline()
            if line:
                chunk.append(line)
            else:
                self.file.seek(where)
                return ''.join(chunk)

class StageProcessor:
    def __init__(self, filename, keywords):
        self.keywords = keywords
        self.seen = set()
        self.last_seen = None

        self.follow = Follow(filename)

    def status(self):
        return 'Stage %d/%d%s' % (
            len(self.seen), 
            len(self.keywords), 
            '' if self.last_seen is None else ' (%s)' % self.last_seen
            )

    def check(self):
        chunk = self.follow.get_chunk()
        if chunk:
            for k in self.keywords:
                if k in chunk:
                    self.last_seen = k
                    self.seen.add(k)

if __name__ == '__main__':
    output_dir = os.path.abspath(sys.argv[1])
    notebook_filename = sys.argv[2]
    status_url = sys.argv[3]

    notebook_path = os.path.join(os.environ['PROJECT_DIR'], notebook_filename)

    dappled_yml_path = os.path.join(os.environ['PROJECT_DIR'], 'dappled.yml')
    yml = ruamel.yaml.load(open(dappled_yml_path).read(), ruamel.yaml.RoundTripLoader) 

    os.chdir(output_dir)

    # nbconvert uses notebook path as current working directory
    # no CLI option to change this, so copy file as workaround
    notebook_path2 = os.path.join(output_dir, 'template.ipynb')
    shutil.copyfile(notebook_path, notebook_path2)

    # proc = subprocess.Popen(['runipy', notebook_path, 'output.ipynb', '--no-chdir'],
    proc = subprocess.Popen(['jupyter-nbconvert', '--execute', '--ExecutePreprocessor.timeout=-1', 
        '--to', 'notebook', '--output-dir', output_dir, '--output', 'output.ipynb', notebook_path2],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    # print proc.pid
    if 'logfile' in yml:
        # TODO: yml validation
        keywords = yml['logfile']['keywords']
        sp = StageProcessor(yml['logfile']['filename'], keywords)
    else:
        sp = None

    pd = ProcessData(proc.pid)

    ticks = 0
    tick_time = 2
    while proc.poll() is None:
        r = ['<table id="stats" class="infotable"><tr><th>Process Name</th><th>% CPU</th><th>Memory</th></tr>']
        update = pd.get_update(tick_size=tick_time)
        if update:
            r.extend('<tr><td>{}</td><td>{}</td><td>{}</td></tr>'.format(*x) for x in update)
        else:
            r.append('<tr><td colspan=3><i>No active processes</i></td></tr>')
        r.append('</table>')

        if sp is not None:
            sp.check()
            r.append(sp.status())

        r.append('Elapsed time: %s<br />' % pd.elapsed_time())
        r.append('Core minutes: %0.2f<br />' % (pd.core_seconds/60.))

        with open('jobinfo.json', 'w') as f:
            f.write(pd.as_json_string())

        ticks += 1
        if ticks > 2: 
            # only start updating after it's been running for a bit
            requests.post(status_url, '\n'.join(r))

        sleep(tick_time)

    print(proc.stderr.read())

    # cleanup
    os.remove(notebook_path2)



