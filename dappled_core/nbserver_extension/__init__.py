from __future__ import absolute_import, print_function

import atexit
import os
import tempfile

from notebook.utils import url_path_join
from notebook.base.handlers import IPythonHandler
from tornado import web

tf = tempfile.NamedTemporaryFile(delete=False)
tf.close()

def clean():
    try: os.remove(tf.name)
    except: pass
atexit.register(clean)

class InputsJsonHandler(IPythonHandler):
    @web.authenticated
    def post(self):
        with open(tf.name, 'wb') as f:
            print(self.request.body, file=f)
        self.finish(tf.name)

def load_jupyter_server_extension(nb_server_app):
    """
    Called when the extension is loaded.

    Args:
        nb_server_app (NotebookWebApplication): handle to the Notebook webserver instance.
    """
    web_app = nb_server_app.web_app
    host_pattern = '.*$'
    route_pattern = url_path_join(web_app.settings['base_url'], '/inputs')
    web_app.add_handlers(host_pattern, [(route_pattern, InputsJsonHandler)])