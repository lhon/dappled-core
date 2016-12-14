import os
import subprocess
import sys

from nbconvert import HTMLExporter
from nbconvert.filters.markdown_mistune import markdown2html_mistune
from tornado import web, gen
import tornado.process
from tornado.httpserver import HTTPServer
import netifaces

# https://gist.github.com/FZambia/5756470

STREAM = tornado.process.Subprocess.STREAM

@gen.coroutine
def call_subprocess(cmd, stdin_data=None, stdin_async=False):
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

