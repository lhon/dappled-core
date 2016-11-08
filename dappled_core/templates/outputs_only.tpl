{# based on nbconvert.templates.html.basic.tpl
    copy of templates/client/include/html_output.html #}
{%- macro grid_attributes(cell, classes) -%}

{%- if (cell.metadata is defined) and (cell.metadata.extensions is defined) and (cell.metadata.extensions.jupyter_dashboards is defined) -%}
    {# Use cell layout metadata if available #}
    {%- if resources.dashboardLayout == 'grid' -%}
      {%- set hidden = cell.metadata.extensions.jupyter_dashboards.views.grid_default.hidden -%}
      {%- set layout = cell.metadata.extensions.jupyter_dashboards.views.grid_default -%}
    {%- else -%}
      {%- set hidden = cell.metadata.extensions.jupyter_dashboards.views.report_default.hidden -%}
      {%- set layout = none -%}
    {%- endif -%}
{%- elif not resources.hasNotebookMetadata -%}
    {# If no notebook metadata available, we're showing everything in a default report mode #}
    {%- set hidden = false -%}
{%- else -%}
    {# If the notebook has dashboard metadata, but the cell is missing metadata, hide the cell because it's never been seen in 
       the dashboard layout mode. #}
    {%- set hidden = true -%}
    {%- set layout = none -%}
{%- endif -%}

{% if (resources.dashboardLayout == "report") -%}
    class="report-cell {{classes}} {{'dashboard-hidden' if hidden}}"
{%- else -%}
    {%- if not hidden and layout -%}
        class="{{classes}} grid-stack-item"
        data-gs-x={{layout.col}} data-gs-y={{layout.row}}
        data-gs-width={{layout.width}} data-gs-height={{layout.height}}
    {%- endif -%}
{%- endif -%}

{%- endmacro -%}

{%- extends 'display_priority.tpl' -%}

{% block codecell scoped %}
<div {{grid_attributes(cell, "cell border-box-sizing code_cell rendered")}}>
{{ super() }}
</div>
{%- endblock codecell %}

{% block output_group %}
<div class="output_wrapper">
<div class="output">
{{ super() }}
</div>
</div>
{% endblock output_group %}

{# 
  output_prompt doesn't do anything in HTML,
  because there is a prompt div in each output area (see output block)
#}
{% block output_prompt %}
{% endblock output_prompt %}

{% block output %}
<div class="output_area">
{{ super() }}
</div>
{% endblock output %}

{% block markdowncell scoped %}
<div {{grid_attributes(cell, "cell border-box-sizing text_cell rendered")}}>
{# {{ self.empty_in_prompt() }} #}
<div class="inner_cell">
<div class="text_cell_render border-box-sizing rendered_html">
{{ cell.source  | markdown2html | strip_files_prefix }}
</div>
</div>
</div>
{%- endblock markdowncell %}

{% block unknowncell scoped %}
unknown type  {{ cell.type }}
{% endblock unknowncell %}

{% block execute_result -%}
{%- set extra_class="output_execute_result" -%}
{% block data_priority scoped %}
{{ super() }}
{% endblock %}
{%- set extra_class="" -%}
{%- endblock execute_result %}

{% block stream_stdout -%}
<div class="output_subarea output_stream output_stdout output_text">
<pre>
{{- output.text | ansi2html -}}
</pre>
</div>
{%- endblock stream_stdout %}

{% block stream_stderr -%}
<div class="output_subarea output_stream output_stderr output_text" style="display: none">
<pre>
{{- output.text | ansi2html -}}
</pre>
</div>
{%- endblock stream_stderr %}

{% block data_svg scoped -%}
<div class="output_svg output_subarea {{extra_class}}">
{%- if output.svg_filename %}
<img src="{{output.svg_filename | posix_path}}"
{%- else %}
{{ output.data['image/svg+xml'] }}
{%- endif %}
</div>
{%- endblock data_svg %}

{% block data_html scoped -%}
<div class="output_html rendered_html output_subarea {{extra_class}}">
{{ output.data['text/html'] }}
</div>
{%- endblock data_html %}

{% block data_markdown scoped -%}
<div class="output_markdown rendered_html output_subarea {{extra_class}}">
{{ output.data['text/markdown'] | markdown2html }}
</div>
{%- endblock data_markdown %}

{% block data_png scoped %}
<div class="output_png output_subarea {{extra_class}}">
{%- if 'image/png' in output.metadata.get('filenames', {}) %}
<img src="{{output.metadata.filenames['image/png'] | posix_path}}"
{%- else %}
<img src="data:image/png;base64,{{ output.data['image/png'] }}"
{%- endif %}
{%- if 'width' in output.metadata.get('image/png', {}) %}
width={{output.metadata['image/png']['width']}}
{%- endif %}
{%- if 'height' in output.metadata.get('image/png', {}) %}
height={{output.metadata['image/png']['height']}}
{%- endif %}
>
</div>
{%- endblock data_png %}

{% block data_jpg scoped %}
<div class="output_jpeg output_subarea {{extra_class}}">
{%- if 'image/jpeg' in output.metadata.get('filenames', {}) %}
<img src="{{output.metadata.filenames['image/jpeg'] | posix_path}}"
{%- else %}
<img src="data:image/jpeg;base64,{{ output.data['image/jpeg'] }}"
{%- endif %}
{%- if 'width' in output.metadata.get('image/jpeg', {}) %}
width={{output.metadata['image/jpeg']['width']}}
{%- endif %}
{%- if 'height' in output.metadata.get('image/jpeg', {}) %}
height={{output.metadata['image/jpeg']['height']}}
{%- endif %}
>
</div>
{%- endblock data_jpg %}

{% block data_latex scoped %}
<div class="output_latex output_subarea {{extra_class}}">
{{ output.data['text/latex'] }}
</div>
{%- endblock data_latex %}

{% block error -%}
<div class="output_subarea output_text output_error">
<pre>
{{- super() -}}
</pre>
</div>
{%- endblock error %}

{%- block traceback_line %}
{{ line | ansi2html }}
{%- endblock traceback_line %}

{%- block data_text scoped %}
<div class="output_text output_subarea {{extra_class}}">
<pre>
{{- output.data['text/plain'] | ansi2html -}}
</pre>
</div>
{%- endblock -%}

{%- block data_javascript scoped %}
<div class="output_subarea output_javascript {{extra_class}}">
<script type="application/disabled_javascript">
{{ output.data['text/javascript'] }}
</script>
</div>
{%- endblock -%}



