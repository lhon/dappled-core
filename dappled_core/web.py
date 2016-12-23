from __future__ import absolute_import, print_function, division, unicode_literals

import nbformat
from nbconvert import HTMLExporter

import tornado
from tornado.httpserver import HTTPServer
import tornado.web
from tornado import web, gen
import tornado.websocket
import tornado.locks

import ruamel.yaml
import jinja2

import argparse
import errno
import json
from collections import OrderedDict
import uuid
import glob
import os
import socket
import sys
import threading
import webbrowser
from datetime import datetime

from dappled_core.lib.utils import format_description, call_subprocess, get_dashboard_exporter

try:
    basestring
except NameError:
    basestring = (str, bytes)
  
# py3 doesn't like this, but both py2/3 seem to work without it?
# sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', 0) # unbuffered

PORT = None
ROOT = os.path.dirname(__file__)

job_conditions = {}


class DappledNotebook(web.RequestHandler):
    def get(self, uuid4=None):
        yml = ruamel.yaml.load(open('dappled.yml').read(), ruamel.yaml.RoundTripLoader) 
        notebook = nbformat.read(open(yml['filename']), as_version=4)
        json_schema = notebook.metadata.dappled.form.json_schema
        if type(json_schema) is list: # backwards compatibility; going forward should always be a list of strings
            json_schema_str = ''.join(json_schema)
        else:
            json_schema_str = json.dumps(json_schema)

        self.render('index.html',
            json_schema=json_schema_str,
            name=yml.get('name') or '',
            description = format_description(yml),
        )

    @gen.coroutine
    def post(self):
        yml = ruamel.yaml.load(open('dappled.yml').read(), ruamel.yaml.RoundTripLoader) 
        notebook_filename = yml['filename']

        inputs = json.loads(self.request.body.decode('utf8'))
        uuid4 = str(uuid.uuid4())
        try: os.mkdir('jobs')
        except: pass
        path = os.path.join('jobs', uuid4)
        os.mkdir(path)

        with open(os.path.join(path, 'inputs.json'), 'wb') as f:
            f.write(self.request.body)

        job_conditions[uuid4] = tornado.locks.Condition()
        self.finish(uuid4)

        status_url = '/'.join(['http://localhost:%d' % PORT, 'status/post', uuid4])
        print('python', os.path.join(ROOT, 'run.py'), path, notebook_filename, status_url)
        result, error = yield call_subprocess(['python', os.path.join(ROOT, 'run.py'), path, notebook_filename, status_url])
        print('run.py output:', result.decode('utf8').replace(r'\n', '\n'))
        if error: print('run.py errors:', error.decode('utf8').replace(r'\n', '\n'))

        job_conditions[uuid4].notify()
        del job_conditions[uuid4]

class ResultsHandler(web.RequestHandler):
    def get(self, uuid4):
        yml = ruamel.yaml.load(open('dappled.yml').read(), ruamel.yaml.RoundTripLoader) 
        notebook = nbformat.read(open(yml['filename']), as_version=4)
        json_schema = notebook.metadata.dappled.form.json_schema
        
        inputs_path = os.path.join('jobs', uuid4, 'inputs.json')
        inputs = json.load(open(inputs_path))

        output_path = os.path.abspath(os.path.join('jobs', uuid4))
        try:
            m = os.stat(output_path).st_mtime
            job_date = datetime.fromtimestamp(m)
        except:
            job_date = None

        # truncate large input values
        for k,v in inputs.items():
            if not isinstance(v, basestring):
                continue

            newv = []
            lines = v.split('\n')
            max_lines = 10
            for line in lines[:max_lines]:
                if len(line) > 80:
                    newv.append(line[:80] + '...')
                else:
                    newv.append(line)
            if len(lines) > max_lines:
                newv.append('(%d lines skipped)' % len(lines)-max_lines)
            inputs[k] = '\n'.join(newv)

        self.render('results.html',
            json_schema=json.dumps(json_schema),
            inputs=inputs,
            uuid4=uuid4,
            name=yml.get('name') or '',
            description = format_description(yml),
            output_path = output_path,
            job_date=job_date,
        )



class OutputHandler(web.RequestHandler):
    def get(self, uuid4):

        path = os.path.join('jobs', uuid4, 'output.ipynb')
        assert os.path.exists(path)

        notebook = nbformat.read(open(path), as_version=4)

        mode = self.get_argument('mode', None)

        params = notebook.get('metadata', {}).get('extensions', {}).get('jupyter_dashboards')
        if params is None or mode == 'notebook':
            exporter = HTMLExporter()
            exporter.template_file = 'full'

            resources = {}
        else:
            exporter = get_dashboard_exporter()

            hasNotebookMetadata = True
            activeView = params['activeView']
            if activeView == 'grid_default' or mode == 'grid':
                dashboard = params['views']['grid_default']
                dashboardLayout = 'grid'
            elif activeView == 'report_default' or mode == 'report':
                dashboard = params['views']['report_default']
                dashboardLayout = 'report'

            resources = dict(
                params=params,
                hasNotebookMetadata=hasNotebookMetadata,
                activeView=activeView,
                dashboard=dashboard,
                dashboardLayout=dashboardLayout,
                )   

        (body, resources) = exporter.from_notebook_node(notebook, resources)

        j = dict(html=body)

        yml = ruamel.yaml.load(open('dappled.yml').read(), ruamel.yaml.RoundTripLoader) 
        if 'results' in yml:
            j['results'] = yml['results']

        self.finish(json.dumps(j))

wss = {}
class StatusHandler(tornado.websocket.WebSocketHandler):
    @gen.coroutine
    def open(self, uuid4):
        wss[uuid4] = self

        if uuid4 in job_conditions:
            print(uuid4, 'in job_conditions')

            yield job_conditions[uuid4].wait()

            self.write_message('done') # trigger page reload
        else:
            path = os.path.join('jobs', uuid4, 'output.ipynb')
            if os.path.exists(path):
                self.write_message('done') # trigger page reload
#            else:
#                # close socket

#        else:
#            self.write_message('job not found')

class StatusPostHandler(web.RequestHandler):
    def post(self, uuid4):
        wss[uuid4].write_message(self.request.body)
        # print(self.request.body)

class PathAutocompleteHandler(web.RequestHandler):

    def get(self):

        path = self.get_argument('term', '').strip()

        if path.startswith('~'):
            orig = path.split('/')[0]
            expanded = os.path.expanduser(orig)
            glob_path = path.replace(orig, expanded)
        else:
            glob_path = path
            
        if "*" not in glob_path:
            glob_path += "*"
        print(glob_path)

        paths = [p+'/' if not p.endswith('/') and os.path.isdir(p) else p 
                        for p in glob.glob(glob_path)]

        # paths = [dict(value=p) for p in paths]

        # selectize remote source format
        paths = [dict(path=p) for p in paths]

        self.finish(json.dumps(paths))


_uuid4_regex = r"(?P<uuid4>[0-9a-f-]{36})"

# TODO: handle paths on windows
static_path = "envs/default/lib/python%d.%d/site-packages/notebook/static/" % sys.version_info[:2]
application = web.Application([
    (r'/', DappledNotebook),
    (r'/results/%s' % _uuid4_regex, ResultsHandler), 
    (r'/output/%s' % _uuid4_regex, OutputHandler), 
    (r'/status/%s' % _uuid4_regex, StatusHandler), 
    (r'/status/post/%s' % _uuid4_regex, StatusPostHandler), 
    (r'/ac', PathAutocompleteHandler),

    (r"/static/urth/(.*)", web.StaticFileHandler, {"path": os.path.join(ROOT, "static", "urth")}),
    (r"/static/imgs/(.*)", web.StaticFileHandler, {"path": os.path.join(ROOT, "static", "imgs")}),
    (r"/static/jupyter_dashboards/(.*)", web.StaticFileHandler, {"path": "envs/default/share/jupyter/nbextensions/jupyter_dashboards"}),
    (r"/static/(.*)", web.StaticFileHandler, {"path": static_path}),
    ],
    template_path=os.path.join(ROOT, 'templates'),
    autoescape=None,
    )

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8008)
    parser.add_argument('--server', action="store_true")

    args = parser.parse_args()

    http_server = HTTPServer(application)

    # if connecting over SSH, then require server mode
    if ('SSH_CONNECTION' in os.environ or 'SSH_CLIENT' in os.environ) and not args.server:
        print('SSH connection detected; using --server')
        args.server = True
        # TODO: password....

    if args.server:
        ip = '0.0.0.0'
    else:
        ip = 'localhost'

    # based on notebook/notebookapp.py
    success = False
    for port in range(args.port, args.port+10):
        try:
            http_server.listen(port, ip)
        except socket.error as e:
            if e.errno == errno.EADDRINUSE:
                print('The port %i is already in use, trying another port.' % port)
                continue
            elif e.errno in (errno.EACCES, getattr(errno, 'WSAEACCES', errno.EACCES)):
                print("Permission to listen on port %i denied" % port)
                continue
            else:
                raise
        else:
            success = True
            break
    if not success:
        print('ERROR: the notebook server could not be started because '
                          'no available port could be found.')
        sys.exit(1)

    global PORT
    PORT = port

    if args.server:
        print('Serving from:')
        ip_addresses = get_ip_addresses()
        for ip in ip_addresses:
            print('  http://%s:%d' % (ip, port))
    else:
        url = 'http://%s:%d' % (ip, port)
        print('Opening browser at:', url)
        try:
            browser = webbrowser.get(None)
        except webbrowser.Error as e:
            browser = None
        if browser:
            b = lambda : browser.open(url, new=2)
            threading.Thread(target=b).start()

    # allows unbuffered() in parent process to catch ctrl-c on Windows
    # http://stackoverflow.com/questions/25965332/subprocess-stdin-pipe-does-not-return-until-program-terminates
    def ping():
        print('ping-%#@($')
    tornado.ioloop.PeriodicCallback(ping, 1000).start()

    tornado.ioloop.IOLoop.instance().start()

if __name__ == '__main__':
    main()
