from setuptools import setup

setup(name='dappled-core',
      version='0.1.0',
      packages=['dappled_core'],
      include_package_data=True, # use MANIFEST.in
      # package_data={
      #   'dappled_core' : [
      #       'static/*', 
      #       'templates/*', 
      #       'nbserver_extension/*'
      #       ],
      # }
      zip_safe=False,
      entry_points={
          'console_scripts': [
              'dappled-run = dappled_core.web:main'
          ]
      },
      scripts=['dappled_core/scripts/jsonenv']
      )