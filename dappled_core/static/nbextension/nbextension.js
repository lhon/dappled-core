require.config({
    paths: {
        ace: '/nbextensions/nbextension/hjson/',
        jsoneditor: '//cdnjs.cloudflare.com/ajax/libs/json-editor/0.7.28/jsoneditor.min',
        // hjson: "/nbextensions/nbextension/hjson/hjson",
        // ace: "//cdnjs.cloudflare.com/ajax/libs/ace/1.2.5/",
        // "mode-hjson": "https://hjson.org/js/mode-hjson",
    },
    shim: {
        jsoneditor: {
            exports: 'JSONEditor'
        }
    }
});

define([
    'base/js/namespace',
    'base/js/events',
    'base/js/dialog',
    'ace/ace',
    'jsoneditor',
    'ace/hjson'
], function(Jupyter, events, dialog, ace, JSONEditor, Hjson) {
    
    var edit_metadata = function (options) {

        var error_div = $('<div/>').css('color', 'red');
        var message = "Create a form using JSON Schema and " +
            "<a target=_blank href=\"https://github.com/jdorn/json-editor\">json-editor</a>. Some notes:" +
            "<ul>" +
            "<li>The editor supports a relaxed version of JSON with quotes and commas generally optional.</li>" +
            "<li>Clicking \"Submit\" on the resulting form will save the current choices to inputs.json</li>" +
            "</ul>";

        var hjdiv = $('<div />')
            .css('float', 'left')
            .css('width', '50%')
            .text(options.hjson_text || "");
        var jediv = $('<div />')
        var save_inputs_button = $('<button />')
            .text('Submit')
            .attr('title', 'Saves choices to input.json')
            .attr('id', 'save_inputs_json')
        var right_div = $('<div />')
            .css('float', 'right')
            .css('width', '50%')
            .css('height', '100%')
            .css('padding-left', '10px')
            .css('border-left', '1px solid #ccc')
            .append(jediv)
            .append(save_inputs_button);
        var side_by_side = $('<div />')
            .css('height', '100%')
            .append(hjdiv)
            .append(right_div)
            ;
        var dialogform = $('<div/>').attr('title', 'Edit form')
            .css('height', '100%')
            .append(
                $('<form/>').append(
                    $('<fieldset/>').append(
                        $('<label/>')
                        .attr('for','metadata')
                        .html(message)
                        )
                        .append(error_div)
                        // .append($('<br/>'))
                        .append(side_by_side)
                        .css('height', '100%')
                    )
                    .css('height', 'calc(100% - 100px)')
            );

        // http://stackoverflow.com/questions/196972/convert-string-to-title-case-with-javascript
        function toTitleCase(str) {
            return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
        }

        function build_schema(params) {
            var params = jQuery.extend(true, {}, params) || {}; // deep copy
            var simple_types = ["number", "string"];
            for (var k in params) {
                // console.log(k, params[k])
                if (simple_types.indexOf(typeof(params[k])) > -1) {
                    params[k] = {
                        default : params[k]
                    };
                } else if (typeof(params[k]) == "boolean") {
                    params[k] = {
                        default : params[k],
                        type: "boolean",
                        format: "checkbox",
                    };
                } else if ($.isArray(params[k])) {
                    params[k] = {
                        default: params[k][0],
                        enum : params[k]
                    };
                }

                if (k.endsWith("_paths")) {
                    params[k]["format"] = "textarea"; // to allow newlines
                }

                if (!params[k]["type"]) {
                    params[k]["type"] = typeof(params[k]["default"]);
                }

                if (!params[k]["title"]) {
                    params[k]["title"] = toTitleCase(k.replace(/[_-]+/g, " "));
                }
            }
            var schema = {
                type: "object",
                title: " ",
                properties: params
            } 

            return schema;
        }
        // JSONEditor.plugins.selectize.enable = true;

        // Initialize the editor with a JSON schema
        var json_editor;
        function reload_json_editor(schema) {
            if (json_editor) json_editor.destroy();

            if (!schema) schema = build_schema();
        
            json_editor = new JSONEditor(jediv[0],{
                schema: schema,
                disable_collapse: true,
                disable_edit_json: true,
                disable_properties: true,
                theme: 'bootstrap3',

            });
            jediv.find('h3').hide();
            jediv.find('select').css('margin-left', '0');
        }
        reload_json_editor();

        // http://stackoverflow.com/questions/38366966/attach-a-local-mode-to-ace-editor-from-cdn
        // ace.config.setModuleUrl("ace/mode/hjson", "https://hjson.org/js/mode-hjson.js")

        var editor = ace.edit(hjdiv[0]);
        editor.setAutoScrollEditorIntoView(true);
        editor.setOption("minLines", 10);
        // http://stackoverflow.com/questions/11584061/automatically-adjust-height-to-contents-in-ace-cloud9-editor/19241577#19241577
        editor.setOption("maxLines", 30);
        // editor.setTheme("ace/theme/monokai");
        editor.getSession().setMode("ace/mode/hjson");
        editor.on("change", change_form);

        function change_form() {
            var text=editor.getSession().getValue();
            try { 
                var json = Hjson.parse(text);
                if (typeof(json) == "object" && !($.isEmptyObject(json)) ) {
                    var schema = build_schema(json);
                    reload_json_editor(schema);
                    // console.log('success')
                    modal_obj.find('button:contains("OK")').prop("disabled",false);
                    $('#save_inputs_json').show();
                } else {
                    modal_obj.find('button:contains("OK")').prop("disabled",true);
                    jediv.html('Enter text on the left and see the form previewed here');
                    $('#save_inputs_json').hide();
                }
            }
            catch (e) {
                text=e.toString();
                if (e.hint) text+="\n\nhint: "+e.hint;
                // console.log(text);
                modal_obj.find('button:contains("OK")')
                    .prop("disabled",true)
                    .prop("title", text);
                $('#save_inputs_json').show();
            }
        }

        var modal_obj = dialog.modal({
            title: "Customize the input form",
            body: dialogform,
            buttons: {
                "OK": {
                    class : "btn-primary",
                    click: function () {
                        var validation_errors = json_editor.validate();
                        
                        if (validation_errors.length) {
                        // if (!json_editor || !json_editor.validate()) {
                            error_div.text('WARNING: Could not save invalid form.\n' + 
                                JSON.stringify(validation_errors,null,2));
                            return false;
                        }
                        var hjson_text = editor.getSession().getValue();
                        var json = Hjson.parse(hjson_text);
                        var json_schema = build_schema(json);
                        options.callback(json, json_schema)
                    }
                },
                Cancel: {}
            },
            notebook: options.notebook,
            keyboard_manager: options.keyboard_manager,
        });


        modal_obj.on('shown.bs.modal', function() { 
            editor.focus();

            $('#save_inputs_json').click(function () {
                var settings = {
                    processData : false,
                    cache : false,
                    type : "POST",
                    data : JSON.stringify(json_editor.getValue()),
                    // dataType : "json",
                    success : function (data, status, xhr) {
                        var path = data;
                        if (Jupyter.notebook.metadata.kernelspec.language == 'python') {
                            // python2 and python 3
                            var cmd = 'import shutil; shutil.copyfile("' + path + '", "inputs.json")';
                            Jupyter.notebook.kernel.execute(cmd);
                        } else if (Jupyter.notebook.metadata.kernelspec.name == 'ir') {
                            var cmd = 'file.copy("' + path + '", "inputs.json", overwrite=TRUE)';
                            Jupyter.notebook.kernel.execute(cmd);
                        } else {
                            alert('Creating inputs.json here using ' + Jupyter.notebook.metadata.kernelspec.language + ' not yet supported')
                        }
                    },
                    error : function () {
                    }
                };
                var url = '/inputs';
                $.ajax(url, settings);

                return false;
            })
        });

        // http://stackoverflow.com/questions/18346203/how-can-i-change-the-width-of-a-bootstrap-3-modal-in-ie8
        // http://stackoverflow.com/questions/24166568/set-bootstrap-modal-body-height-by-percentage
        modal_obj.find('.modal-dialog')
            .css('width', '90%')
            .css('max-width', '900px')
            .css('height', '90%')
        modal_obj.find('.modal-content')
            .css('height', '100%')
        modal_obj.find('.modal-body')
            .css('height', '100%')
            .css('max-height', 'calc(100% - 120px)')

        // hides annoying "Edit Form" tooltip
        modal_obj.find('.modal-body > div').attr('title', '');

        change_form();

    };
    
    function format_json(json, indent) {
        if (!indent) indent = 0;
        var json_str = "";
        var newv;
        for (var k in json) {
            // console.log(k, v)
            var v = json[k];
            if (typeof(v) != "object" || $.isArray(v)) {
                newv = JSON.stringify(v);
            } else {
                newv = "{\n" + format_json(v, indent+2) + " ".repeat(indent) + "}";
            }
            json_str += " ".repeat(indent) + k + ": " + newv + "\n";
        }

        return json_str;
    }

    function load_ipython_extension() {

        var handler = function () {
            var that = this;
            var md = Jupyter.notebook.metadata;
            if (!md.dappled) md.dappled = {};
            if (!md.dappled.form) md.dappled.form = {json:"",json_schema:""}
            edit_metadata({
                hjson_text: format_json(md.dappled.form.json),
                callback: function (json, json_schema) {
                    md.dappled.form = {
                        json: json,
                        json_schema: json_schema
                    }
                },
                notebook: Jupyter.notebook,
                keyboard_manager: Jupyter.notebook.keyboard_manager
            });
        };

        var _b = $('<button/>')
                .attr('title','Customize this notebook with form-driven user inputs')
                .addClass('btn btn-default')
                .html('<i class="fa fa-th-list"></i> Edit Form');
        var btn = $('<div/>').addClass('btn-group').append(_b)
        btn.on("click", handler)
            .appendTo('#maintoolbar-container');

        // var action = {
        //     icon: 'fa-th-list', // a font-awesome class used on buttons, etc
        //     help    : 'Show an alert',
        //     help_index : 'zz',
        //     handler : handler
        // };
        // var prefix = 'my_extension';
        // var action_name = 'show-alert';

        // var full_action_name = Jupyter.actions.register(action, name, prefix); // returns 'my_extension:show-alert'
        // Jupyter.toolbar.add_buttons_group([full_action_name]);

        $("button:contains('CellToolbar')").hide(); 
        // $( '<style>button[title~="celltoolbar"] {display: none}</style>' ).appendTo( "head" )
    }

    return {
        load_ipython_extension: load_ipython_extension
    };
});