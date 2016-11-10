import nbformat
from nbconvert import HTMLExporter

import tornado
import tornado.web
from tornado.httpserver import HTTPServer
from tornado import web, gen
import tornado.websocket
import tornado.locks
import tornado.process
import subprocess

import ruamel.yaml
import jinja2

import json
from collections import OrderedDict
import uuid
import glob
import os

ROOT = os.path.dirname(__file__)

type_map = {
        str : 'string',
        int : 'integer',
        float: 'number',
        }

job_conditions = {}

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

class DappledApp(web.RequestHandler):
    def get(self, uuid4=None):
        yml = ruamel.yaml.load(open('dappled.yml').read(), ruamel.yaml.RoundTripLoader) 
        notebook = nbformat.read(open(yml['filename']), as_version=4)
        json_schema = notebook.metadata.dappled.form.json_schema
        
        if uuid4 is not None:
            inputs = open(os.path.join('jobs', uuid4, 'inputs.json')).read()
        else:
            inputs = None

        self.render('index.html',
            json_schema=json.dumps(json_schema),
            inputs=inputs,
            uuid4=uuid4,
            name=yml.get('name') or '',
            description = yml.get('description') or '',
        )

    @gen.coroutine
    def post(self):
        print self.request.body

        yml = ruamel.yaml.load(open('dappled.yml').read(), ruamel.yaml.RoundTripLoader) 
        notebook_filename = yml['filename']

        inputs = json.loads(self.request.body)
        uuid4 = str(uuid.uuid4())
        try: os.mkdir('jobs')
        except: pass
        path = os.path.join('jobs', uuid4)
        os.mkdir(path)

        with open(os.path.join(path, 'inputs.json'), 'w') as f:
            print >>f, self.request.body.strip()

        job_conditions[uuid4] = tornado.locks.Condition()
        self.finish(uuid4)

    	result, error = yield call_subprocess(['python', os.path.join(ROOT, 'run.py'), path, notebook_filename])
        # print('stdin sync: ', result, error)

        job_conditions[uuid4].notify()
        del job_conditions[uuid4]

def get_app_exporter():
    here = os.path.dirname(__file__)
    template_path = os.path.abspath(os.path.join(here, 'templates'))

    class MyHTMLExporter(HTMLExporter):
        def _default_template_path_default(self):
            return template_path

        def _template_file_default(self):
            return 'dashboard'

    exporter = MyHTMLExporter()

    return exporter


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
            exporter = get_app_exporter()

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

        self.finish(body)


class StatusHandler(tornado.websocket.WebSocketHandler):
    @gen.coroutine
    def open(self, uuid4):
        if uuid4 in job_conditions:
            print uuid4, 'in job_conditions'

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
        print glob_path

        paths = [p+'/' if not p.endswith('/') and os.path.isdir(p) else p 
                        for p in glob.glob(glob_path)]

        # selectize remote source format
        paths = [dict(value=p) for p in paths]

        self.finish(json.dumps(paths))


_uuid4_regex = r"(?P<uuid4>[0-9a-f-]{36})"

application = web.Application([
    (r'/', DappledApp),
    (r'/results/%s' % _uuid4_regex, DappledApp), 
    (r'/output/%s' % _uuid4_regex, OutputHandler), 
    (r'/status/%s' % _uuid4_regex, StatusHandler), 
    (r'/ac', PathAutocompleteHandler),

    (r"/static/urth/(.*)", web.StaticFileHandler, {"path": os.path.join(ROOT, "static", "urth")}),
    (r"/static/imgs/(.*)", web.StaticFileHandler, {"path": os.path.join(ROOT, "static", "imgs")}),
    (r"/static/jupyter_dashboards/(.*)", web.StaticFileHandler, {"path": "envs/default/share/jupyter/nbextensions/jupyter_dashboards"}),
    (r"/static/(.*)", web.StaticFileHandler, {"path": "envs/default/lib/python2.7/site-packages/notebook/static/"}),
    ],
    template_path=os.path.join(ROOT, 'templates'),
    autoescape=None,
    )

def main():
    http_server = HTTPServer(application)
    http_server.listen(8008)
    print 'ready'
    tornado.ioloop.IOLoop.instance().start()

if __name__ == '__main__':
    main()
