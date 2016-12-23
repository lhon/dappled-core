import os
import subprocess
import sys
import time

from nbconvert import HTMLExporter
from nbconvert.filters.markdown_mistune import markdown2html_mistune
from tornado import web, gen
import tornado.process
from tornado.httpserver import HTTPServer
from tornado.ioloop import IOLoop
import netifaces


@gen.coroutine
def call_subprocess(cmd, stdin_data=None, stdin_async=False):
    if os.name == 'nt':
        assert stdin_data is None and stdin_async is False
        ret = yield call_subprocess_windows(cmd)
    else:
        ret = yield call_subprocess_posix(cmd, stdin_data, stdin_async)

    raise gen.Return(ret)

# https://gist.github.com/FZambia/5756470
STREAM = tornado.process.Subprocess.STREAM
@gen.coroutine
def call_subprocess_posix(cmd, stdin_data=None, stdin_async=False):
    """
    Wrapper around subprocess call using Tornado's Subprocess class.
    """
    stdin = STREAM if stdin_async else subprocess.PIPE

    sub_process = tornado.process.Subprocess(
        cmd, stdin=stdin, stdout=STREAM, stderr=STREAM
    )

    if stdin_data:
        if stdin_async:
            yield gen.Task(sub_process.stdin.write, stdin_data)
        else:
            sub_process.stdin.write(stdin_data)

    if stdin_async or stdin_data:
        sub_process.stdin.close()

    result, error = yield [
        gen.Task(sub_process.stdout.read_until_close),
        gen.Task(sub_process.stderr.read_until_close)
    ]

    raise gen.Return((result, error))

@gen.coroutine
def call_subprocess_windows(cmd, pollrate=0.5):
    ''' 
    async-friendly polling for windows
    since tornado's Subprocess is posix only:
    https://github.com/tornadoweb/tornado/commit/47af4c0bba37a58c1af64ccc95f386098074a354
    '''
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    while proc.poll() is None:
        # http://stackoverflow.com/questions/11128923/tornado-equivalent-of-delay
        yield gen.Task(IOLoop.instance().add_timeout, time.time() + pollrate)

    raise gen.Return((proc.stdout.read(), proc.stderr.read()))

# copied from dappled/lib/utils.py
def get_ip_addresses():
    results = []
    for if_name in netifaces.interfaces():
        if if_name == 'lo': continue
        for info in netifaces.ifaddresses(if_name).setdefault(netifaces.AF_INET, []):
            if 'addr' in info:
                results.append(info['addr'])
    if not results:
        return ['127.0.0.1']
    return results

def format_description(yml):
    description = yml.get('description')
    if description:
        return markdown2html_mistune(description)
    return ''

def get_dashboard_exporter():
    here = os.path.dirname(__file__)
    template_path = os.path.abspath(os.path.join(here, '..', 'templates'))

    class MyHTMLExporter(HTMLExporter):
        def _default_template_path_default(self):
            return template_path

        def _template_file_default(self):
            return 'dashboard'

    exporter = MyHTMLExporter()

    return exporter

def format_elapsed(sec):
    t, u = sec, 's'
    if t > 60.: t, u = t/60., 'm'
    if t > 60.: t, u = t/60., 'h'

    return '%0.1f%s' % (t, u)

