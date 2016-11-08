{#-
 Copyright (c) Jupyter Development Team.
 Distributed under the terms of the Modified BSD License.
-#}

{%- extends 'outputs_only.tpl' -%}
{%- block header -%}
<!DOCTYPE HTML>
<html>
<head>
{%- block html_head -%}
    <meta charset="utf-8">
    <title>{{ nb.name }}</title>
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <script>
        var IPython = {};
        var Urth = window.Urth = window.Urth || {};
        Urth.kernel_name = '{%- if (nb.metadata is defined) and (nb.metadata.kernelspec is defined) and (nb.metadata.kernelspec.name is defined) %}
            {{- nb.metadata.kernelspec.name -}}
        {%- endif -%}' || 'python3';
        {% if resources.params -%}
            {%- set dashboard = resources.dashboard -%}
            {%- set dashboardLayout = dashboard.type -%}
            {%- set maxColumns = dashboard.maxColumns or 12 -%}
            {%- set cellMargin = dashboard.cellMargin or 10-%}
            {%- set defaultCellHeight = dashboard.defaultCellHeight or 20 -%}
            Urth.maxColumns = {{maxColumns}};
            Urth.cellMargin = {{cellMargin}};
            Urth.defaultCellHeight = {{defaultCellHeight}};
        {%- endif -%}
        Urth.layout = "{{resources.dashboardLayout}}";
    </script>
    <script src="/static/jupyter_dashboards/notebook/bower_components/requirejs/require.js"></script>

    <link rel="stylesheet" type="text/css" href="/static/jupyter_dashboards/notebook/bower_components/jquery-ui/themes/smoothness/jquery-ui.min.css">
    {% if (resources.dashboardLayout == "grid") -%}
    <!-- <link rel="stylesheet" type="text/css" href="/static/jupyter_dashboards/notebook/bower_components/gridstack/dist/gridstack.min.css"> -->
    <link rel="stylesheet" type="text/css" href="//cdnjs.cloudflare.com/ajax/libs/gridstack.js/0.2.6/gridstack.min.css">
    <link rel="stylesheet" type="text/css" href="/static/jupyter_dashboards/notebook/dashboard-common/gridstack-overrides.css">
    {% endif -%}
    <link rel="stylesheet" type="text/css" href="/static/style/style.min.css">
    <link rel="stylesheet" type="text/css" href="/static/jupyter_dashboards/notebook/dashboard-common/dashboard-common.css">
    <link rel="stylesheet" type="text/css" href="/static/urth/dashboard.css">

{%- endblock html_head -%}
</head>
{%- endblock header -%}

{% block body %}
<body class="urth-dashboard">

<noscript>
<div id='noscript'>
    This page requires JavaScript.<br>
    Please enable it to proceed.
</div>
</noscript>

<div id="outer-dashboard" class="container" style="visibility: hidden;">
    <div id="dashboard-container" class="container" data-dashboard-layout="{{resources.dashboardLayout}}">
{{ super() }}
    </div>
</div>

<div class="busy-indicator progress">
    <div class="progress-bar progress-bar-striped" role="progressbar" aria-valuenow="100"
        aria-valuemin="0" aria-valuemax="100" style="width: 100%;"></div>
</div>

    <script>
    require.config({
		baseUrl: '/static/',
        paths: {
            jquery: "jupyter_dashboards/notebook/bower_components/jquery/dist/jquery.min",
            // jquery-ui path changed
            // https://github.com/troolee/gridstack.js/issues/513
            'jquery-ui': 'jupyter_dashboards/notebook/bower_components/jquery-ui/ui/',
            lodash: 'jupyter_dashboards/notebook/bower_components/lodash/dist/lodash.min',
            // bundled version of gridstack not compatible with jquery 3.0
            // https://github.com/troolee/gridstack.js/issues/486
            // Gridstack: 'jupyter_dashboards/notebook/bower_components/gridstack/dist/gridstack.min',
            Gridstack: '//cdnjs.cloudflare.com/ajax/libs/gridstack.js/0.2.6/gridstack.min',
            'urth-common': 'jupyter_dashboards/notebook/dashboard-common',
        },
        map: {
            '*': {
                'jQuery': 'jquery'
            },
        }
    });


requirejs(['urth/dashboard',
    'jquery'
], function(
    Dashboard) {

    Dashboard.init().then(function () {
        console.log('done');
    });
});

    </script>
</body>
{%- endblock body %}

{% block footer %}
</html>
{% endblock footer %}
