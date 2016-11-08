import os
import json
import subprocess
import sys

output_dir = sys.argv[1]
notebook_filename = sys.argv[2]

notebook_path = os.path.join(os.environ['PROJECT_DIR'], notebook_filename)

os.chdir(output_dir)

proc = subprocess.Popen(['runipy', notebook_path, 'output.ipynb', '--no-chdir'])

print proc.pid

