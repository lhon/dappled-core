(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Hjson = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/* Hjson http://hjson.org */
/* jslint node: true */
"use strict";

var os=require('os'); // will be {} when used in a browser

function tryParseNumber(text, stopAtNext) {

  // try to parse a number

  var number, string = '', leadingZeros = 0, testLeading = true;
  var at = 0;
  var ch;
  function next() {
    ch = text.charAt(at);
    at++;
    return ch;
  }

  next();
  if (ch === '-') {
    string = '-';
    next();
  }
  while (ch >= '0' && ch <= '9') {
    if (testLeading) {
      if (ch == '0') leadingZeros++;
      else testLeading = false;
    }
    string += ch;
    next();
  }
  if (testLeading) leadingZeros--; // single 0 is allowed
  if (ch === '.') {
    string += '.';
    while (next() && ch >= '0' && ch <= '9')
      string += ch;
  }
  if (ch === 'e' || ch === 'E') {
    string += ch;
    next();
    if (ch === '-' || ch === '+') {
      string += ch;
      next();
    }
    while (ch >= '0' && ch <= '9') {
      string += ch;
      next();
    }
  }

  // skip white/to (newline)
  while (ch && ch <= ' ') next();

  if (stopAtNext) {
    // end scan if we find a punctuator character like ,}] or a comment
    if (ch === ',' || ch === '}' || ch === ']' ||
      ch === '#' || ch === '/' && (text[at] === '/' || text[at] === '*')) ch = 0;
  }

  number = +string;
  if (ch || leadingZeros || !isFinite(number)) return undefined;
  else return number;
}

module.exports = {
  EOL: os.EOL || '\n',
  tryParseNumber: tryParseNumber,
};

},{"os":7}],2:[function(require,module,exports){
/* Hjson http://hjson.org */
/* jslint node: true */
"use strict";

var common = require("./hjson-common");

function loadDsf(col, type) {

  if (Object.prototype.toString.apply(col) !== '[object Array]') {
    if (col) throw new Error("dsf option must contain an array!");
    else return nopDsf;
  } else if (col.length === 0) return nopDsf;

  var dsf = [];
  function isFunction(f) { return {}.toString.call(f) === '[object Function]'; }

  col.forEach(function(x) {
    if (!x.name || !isFunction(x.parse) || !isFunction(x.stringify))
      throw new Error("extension does not match the DSF interface");
    dsf.push(function() {
      try {
        if (type == "parse") {
          return x.parse.apply(null, arguments);
        } else if (type == "stringify") {
          var res=x.stringify.apply(null, arguments);
          // check result
          if (res !== undefined && (typeof res !== "string" ||
            res.length === 0 ||
            res[0] === '"' ||
            [].some.call(res, function(c) { return isInvalidDsfChar(c); })))
            throw new Error("value may not be empty, start with a quote or contain a punctuator character except colon: " + res);
          return res;
        } else throw new Error("Invalid type");
      } catch (e) {
        throw new Error("DSF-"+x.name+" failed; "+e.message);
      }
    });
  });

  return runDsf.bind(null, dsf);
}

function runDsf(dsf, value) {
  if (dsf) {
    for (var i = 0; i < dsf.length; i++) {
      var res = dsf[i](value);
      if (res !== undefined) return res;
    }
  }
}

function nopDsf(value) {
}

function isInvalidDsfChar(c) {
  return c === '{' || c === '}' || c === '[' || c === ']' || c === ',';
}


function math(opt) {
  return {
    name: "math",
    parse: function (value) {
      switch (value) {
        case "+inf":
        case "inf":
        case "+Inf":
        case "Inf": return Infinity;
        case "-inf":
        case "-Inf": return -Infinity;
        case "nan":
        case "NaN": return NaN;
      }
    },
    stringify: function (value) {
      if (typeof value !== 'number') return;
      if (1 / value === -Infinity) return "-0"; // 0 === -0
      if (value === Infinity) return "Inf";
      if (value === -Infinity) return "-Inf";
      if (isNaN(value)) return "NaN";
    },
  };
}
math.description="support for Inf/inf, -Inf/-inf, Nan/naN and -0";

function hex(opt) {
  var out=opt && opt.out;
  return {
    name: "hex",
    parse: function (value) {
      if (/^0x[0-9A-Fa-f]+$/.test(value))
        return parseInt(value, 16);
    },
    stringify: function (value) {
      if (out && Number.isInteger(value))
        return "0x"+value.toString(16);
    },
  };
}
hex.description="parse hexadecimal numbers prefixed with 0x";

function date(opt) {
  return {
    name: "date",
    parse: function (value) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        /^\d{4}-\d{2}-\d{2}T\d{2}\:\d{2}\:\d{2}(?:.\d+)(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
        var dt = Date.parse(value);
        if (!isNaN(dt)) return new Date(dt);
      }
    },
    stringify: function (value) {
      if (Object.prototype.toString.call(value) === '[object Date]') {
        var dt = value.toISOString();
        if (dt.indexOf("T00:00:00.000Z", dt.length - 14) !== -1) return dt.substr(0, 10);
        else return dt;
      }
    },
  };
}
date.description="support ISO dates";

module.exports = {
  loadDsf: loadDsf,
  std: {
    math: math,
    hex: hex,
    date: date,
  },
};

},{"./hjson-common":1}],3:[function(require,module,exports){
/* Hjson http://hjson.org */
/* jslint node: true */
"use strict";

module.exports = function($source, $opt) {

  var common = require("./hjson-common");
  var dsf = require("./hjson-dsf");

  var text;
  var at;   // The index of the current character
  var ch;   // The current character
  var escapee = {
    '"': '"',
    '\\': '\\',
    '/': '/',
    b:  '\b',
    f:  '\f',
    n:  '\n',
    r:  '\r',
    t:  '\t'
  };

  var keepWsc; // keep whitespace
  var runDsf; // domain specific formats

  function resetAt() {
    at = 0;
    ch = ' ';
  }

  function isPunctuatorChar(c) {
    return c === '{' || c === '}' || c === '[' || c === ']' || c === ',' || c === ':';
  }

  // Call error when something is wrong.
  function error(m) {
    var i, col=0, line=1;
    for (i = at-1; i > 0 && text[i] !== '\n'; i--, col++) {}
    for (; i > 0; i--) if (text[i] === '\n') line++;
    throw new Error(m + " at line " + line + "," + col + " >>>" + text.substr(at-col, 20) + " ...");
  }

  function next() {
    // get the next character.
    ch = text.charAt(at);
    at++;
    return ch;
  }

  function peek(offs) {
    // range check is not required
    return text.charAt(at + offs);
  }

  function string() {
    // Parse a string value.
    var string = '';

    // When parsing for string values, we must look for " and \ characters.
    if (ch === '"') {
      while (next()) {
        if (ch === '"') {
          next();
          return string;
        }
        if (ch === '\\') {
          next();
          if (ch === 'u') {
            var uffff = 0;
            for (var i = 0; i < 4; i++) {
              next();
              var c = ch.charCodeAt(0), hex;
              if (ch >= '0' && ch <= '9') hex = c - 48;
              else if (ch >= 'a' && ch <= 'f') hex = c - 97 + 0xa;
              else if (ch >= 'A' && ch <= 'F') hex = c - 65 + 0xa;
              else error("Bad \\u char " + ch);
              uffff = uffff * 16 + hex;
            }
            string += String.fromCharCode(uffff);
          } else if (typeof escapee[ch] === 'string') {
            string += escapee[ch];
          } else break;
        } else {
          string += ch;
        }
      }
    }
    error("Bad string");
  }

  function mlString() {
    // Parse a multiline string value.
    var string = '', triple = 0;

    // we are at ''' +1 - get indent
    var indent = 0;
    while (true) {
      var c=peek(-indent-5);
      if (!c || c === '\n') break;
      indent++;
    }

    function skipIndent() {
      var skip = indent;
      while (ch && ch <= ' ' && ch !== '\n' && skip-- > 0) next();
    }

    // skip white/to (newline)
    while (ch && ch <= ' ' && ch !== '\n') next();
    if (ch === '\n') { next(); skipIndent(); }

    // When parsing multiline string values, we must look for ' characters.
    while (true) {
      if (!ch) {
        error("Bad multiline string");
      } else if (ch === '\'') {
        triple++;
        next();
        if (triple === 3) {
          if (string.slice(-1) === '\n') string=string.slice(0, -1); // remove last EOL
          return string;
        } else continue;
      } else {
        while (triple > 0) {
          string += '\'';
          triple--;
        }
      }
      if (ch === '\n') {
        string += '\n';
        next();
        skipIndent();
      } else {
        if (ch !== '\r') string += ch;
        next();
      }
    }
  }

  function keyname() {
    // quotes for keys are optional in Hjson
    // unless they include {}[],: or whitespace.

    if (ch === '"') return string();

    var name = "", start = at, space = -1;
    while (true) {
      if (ch === ':') {
        if (!name) error("Found ':' but no key name (for an empty key name use quotes)");
        else if (space >=0 && space !== name.length) { at = start + space; error("Found whitespace in your key name (use quotes to include)"); }
        return name;
      } else if (ch <= ' ') {
        if (!ch) error("Found EOF while looking for a key name (check your syntax)");
        else if (space < 0) space = name.length;
      } else if (isPunctuatorChar(ch)) {
        error("Found '" + ch + "' where a key name was expected (check your syntax or use quotes if the key name includes {}[],: or whitespace)");
      } else {
        name += ch;
      }
      next();
    }
  }

  function white() {
    while (ch) {
      // Skip whitespace.
      while (ch && ch <= ' ') next();
      // Hjson allows comments
      if (ch === '#' || ch === '/' && peek(0) === '/') {
        while (ch && ch !== '\n') next();
      } else if (ch === '/' && peek(0) === '*') {
        next(); next();
        while (ch && !(ch === '*' && peek(0) === '/')) next();
        if (ch) { next(); next(); }
      } else break;
    }
  }

  function tfnns() {
    // Hjson strings can be quoteless
    // returns string, true, false, or null.
    var value = ch;
    if (isPunctuatorChar(ch))
      error("Found a punctuator character '" + ch + "' when expecting a quoteless string (check your syntax)");

    for(;;) {
      next();
      if (value.length === 3 && value === "'''") return mlString();
      var isEol = ch === '\r' || ch === '\n' || ch === '';
      if (isEol ||
        ch === ',' || ch === '}' || ch === ']' ||
        ch === '#' ||
        ch === '/' && (peek(0) === '/' || peek(0) === '*')
        ) {
        // this tests for the case of {true|false|null|num}
        // followed by { ',' | '}' | ']' | '#' | '//' | '/*' }
        // which needs to be parsed as the specified value
        var chf = value[0];
        switch (chf) {
          case 'f': if (value.trim() === "false") return false; break;
          case 'n': if (value.trim() === "null") return null; break;
          case 't': if (value.trim() === "true") return true; break;
          default:
            if (chf === '-' || chf >= '0' && chf <= '9') {
              var n = common.tryParseNumber(value);
              if (n !== undefined) return n;
            }
        }
        if (isEol) {
          // remove any whitespace at the end (ignored in quoteless strings)
          value = value.trim();
          var dsfValue = runDsf(value);
          return dsfValue !== undefined ? dsfValue : value;
        }
      }
      value += ch;
    }
  }

  function getComment(wat) {
    var i;
    wat--;
    // remove trailing whitespace
    for (i = at - 2; i > wat && text[i] <= ' ' && text[i] !== '\n'; i--);
    // but only up to EOL
    if (text[i] === '\n') i--;
    if (text[i] === '\r') i--;
    var res = text.substr(wat, i-wat+1);
    for (i = 0; i < res.length; i++)
      if (res[i] > ' ') return res;
    return "";
  }

  function errorClosingHint(value) {
    function search(value, ch) {
      var i, k, length, res;
      switch (typeof value) {
        case 'string':
          if (value.indexOf(ch) >= 0) res=value;
          break;
        case 'object':
          if (Object.prototype.toString.apply(value) === '[object Array]') {
            for (i = 0, length = value.length; i < length; i++) {
              res=search(value[i], ch) || res;
            }
          } else {
            for (k in value) {
              if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
              res=search(value[k], ch) || res;
            }
          }
      }
      return res;
    }

    function report(ch) {
      var possibleErr=search(value, ch);
      if (possibleErr) {
        return "found '"+ch+"' in a string value, your mistake could be with:\n"+
          "  > "+possibleErr+"\n"+
          "  (unquoted strings contain everything up to the next line!)";
      } else return "";
    }

    return report('}') || report(']');
  }

  function array() {
    // Parse an array value.
    // assuming ch === '['

    var array = [];
    var kw, wat;
    try {
      if (keepWsc) {
        if (Object.defineProperty) Object.defineProperty(array, "__WSC__", { enumerable: false, writable: true });
        array.__WSC__ = kw = [];
      }

      next();
      wat = at;
      white();
      if (kw) kw.push(getComment(wat));
      if (ch === ']') {
        next();
        return array;  // empty array
      }

      while (ch) {
        array.push(value());
        wat = at;
        white();
        // in Hjson the comma is optional and trailing commas are allowed
        if (ch === ',') { next(); wat = at; white(); }
        if (kw) kw.push(getComment(wat));
        if (ch === ']') {
          next();
          return array;
        }
        white();
      }

      error("End of input while parsing an array (missing ']')");
    } catch (e) {
      e.hint=e.hint||errorClosingHint(array);
      throw e;
    }
  }

  function object(withoutBraces) {
    // Parse an object value.

    var key, object = {};
    var kw, wat;
    function pushWhite(key) { kw.c[key]=getComment(wat); if (key) kw.o.push(key); }

    try {
      if (keepWsc) {
        if (Object.defineProperty) Object.defineProperty(object, "__WSC__", { enumerable: false, writable: true });
        object.__WSC__ = kw = { c: {}, o: []  };
        if (withoutBraces) kw.noRootBraces = true;
      }

      if (!withoutBraces) {
        // assuming ch === '{'
        next();
        wat = at;
      } else wat = 1;

      white();
      if (kw) pushWhite("");
      if (ch === '}' && !withoutBraces) {
        next();
        return object;  // empty object
      }
      while (ch) {
        key = keyname();
        white();
        if (ch !== ':') error("Expected ':' instead of '" + ch + "'");
        next();
        // duplicate keys overwrite the previous value
        object[key] = value();
        wat = at;
        white();
        // in Hjson the comma is optional and trailing commas are allowed
        if (ch === ',') { next(); wat = at; white(); }
        if (kw) pushWhite(key);
        if (ch === '}' && !withoutBraces) {
          next();
          return object;
        }
        white();
      }

      if (withoutBraces) return object;
      else error("End of input while parsing an object (missing '}')");
    } catch (e) {
      e.hint=e.hint||errorClosingHint(object);
      throw e;
    }
  }

  function value() {
    // Parse a Hjson value. It could be an object, an array, a string, a number or a word.

    white();
    switch (ch) {
      case '{': return object();
      case '[': return array();
      case '"': return string();
      default: return tfnns();
    }
  }

  function checkTrailing(v) {
    white();
    if (ch) error("Syntax error, found trailing characters");
    return v;
  }

  function rootValue() {
    // Braces for the root object are optional
    white();
    switch (ch) {
      case '{': return checkTrailing(object());
      case '[': return checkTrailing(array());
    }

    try {
      // assume we have a root object without braces
      return checkTrailing(object(true));
    } catch (e) {
      // test if we are dealing with a single JSON value instead (true/false/null/num/"")
      resetAt();
      try { return checkTrailing(value()); }
      catch (e2) { throw e; } // throw original error
    }
  }

  function hjsonParse(source, opt) {
    var dsfDef = null;
    if (opt && typeof opt === 'object') {
      keepWsc = opt.keepWsc;
      dsfDef = opt.dsf;
    }
    runDsf = dsf.loadDsf(dsfDef, "parse");
    text = source;
    resetAt();
    return rootValue();
  }

  return hjsonParse($source, $opt);
};

},{"./hjson-common":1,"./hjson-dsf":2}],4:[function(require,module,exports){
/* Hjson http://hjson.org */
/* jslint node: true */
"use strict";

module.exports = function($value, $opt) {

  var common = require("./hjson-common");
  var dsf = require("./hjson-dsf");

  var runDsf; // domain specific formats

  // needsEscape tests if the string can be written without escapes
  var needsEscape = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
  // needsQuotes tests if the string can be written as a quoteless string (includes needsEscape but without \\ and \")
  var needsQuotes = /^\s|^"|^'''|^#|^\/\*|^\/\/|^\{|^\}|^\[|^\]|^:|^,|\s$|[\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
  // needsEscapeML tests if the string can be written as a multiline string (includes needsEscape but without \n, \r, \\ and \")
  var needsEscapeML = /'''|[\x00-\x09\x0b\x0c\x0e-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
  // starts with a keyword and optionally is followed by a comment
  var startsWithKeyword = /^(true|false|null)\s*((,|\]|\}|#|\/\/|\/\*).*)?$/;
  var meta =
  {  // table of character substitutions
    '\b': 'b',
    '\t': 't',
    '\n': 'n',
    '\f': 'f',
    '\r': 'r',
    '"' : '"',
    '\\': '\\'
  };
  var needsEscapeName = /[,\{\[\}\]\s:#"]|\/\/|\/\*|'''/;
  var gap = '';
  var indent = '  ';
  // options
  var eol, keepWsc, bracesSameLine, quoteAlways, emitRootBraces;
  var token = {
    obj:  [ '{', '}' ],
    arr:  [ '[', ']' ],
    key:  [ '',  '' ],
    qkey: [ '"', '"' ],
    col:  [ ':' ],
    str:  [ '', '' ],
    qstr: [ '"', '"' ],
    mstr: [ "'''", "'''" ],
    num:  [ '', '' ],
    lit:  [ '', '' ],
    dsf:  [ '', '' ],
    esc:  [ '\\', '' ],
    uni:  [ '\\u', '' ],
    rem:  [ '', '' ],
  };

  function wrap(tk, v) { return tk[0] + v + tk[1]; }

  function quoteReplace(string) {
    return string.replace(needsEscape, function (a) {
      var c = meta[a];
      if (typeof c === 'string') return wrap(token.esc, c);
      else return wrap(token.uni, ('0000' + a.charCodeAt(0).toString(16)).slice(-4));
    });
  }

  function quote(string, gap, hasComment, isRootObject) {
    if (!string) return wrap(token.qstr, '');

    needsQuotes.lastIndex = 0;
    startsWithKeyword.lastIndex = 0;

    // Check if we can insert this string without quotes
    // see hjson syntax (must not parse as true, false, null or number)

    if (quoteAlways || hasComment ||
      needsQuotes.test(string) ||
      common.tryParseNumber(string, true) !== undefined ||
      startsWithKeyword.test(string)) {

      // If the string contains no control characters, no quote characters, and no
      // backslash characters, then we can safely slap some quotes around it.
      // Otherwise we first check if the string can be expressed in multiline
      // format or we must replace the offending characters with safe escape
      // sequences.

      needsEscape.lastIndex = 0;
      needsEscapeML.lastIndex = 0;
      if (!needsEscape.test(string)) return wrap(token.qstr, string);
      else if (!needsEscapeML.test(string) && !isRootObject) return mlString(string, gap);
      else return wrap(token.qstr, quoteReplace(string));
    } else {
      // return without quotes
      return wrap(token.str, string);
    }
  }

  function mlString(string, gap) {
    // wrap the string into the ''' (multiline) format

    var i, a = string.replace(/\r/g, "").split('\n');
    gap += indent;

    if (a.length === 1) {
      // The string contains only a single line. We still use the multiline
      // format as it avoids escaping the \ character (e.g. when used in a
      // regex).
      return wrap(token.mstr, a[0]);
    } else {
      var res = eol + gap + token.mstr[0];
      for (i = 0; i < a.length; i++) {
        res += eol;
        if (a[i]) res += gap + a[i];
      }
      return res + eol + gap + token.mstr[1];
    }
  }

  function quoteKey(name) {
    if (!name) return '""';

    // Check if we can insert this key without quotes

    if (needsEscapeName.test(name)) {
      needsEscape.lastIndex = 0;
      return wrap(token.qkey, needsEscape.test(name) ? quoteReplace(name) : name);
    } else {
      // return without quotes
      return wrap(token.key, name);
    }
  }

  function str(value, hasComment, noIndent, isRootObject) {
    // Produce a string from value.

    function startsWithNL(str) { return str && str[str[0] === '\r' ? 1 : 0] === '\n'; }
    function testWsc(str) { return str && !startsWithNL(str); }
    function wsc(str) {
      if (!str) return "";
      var i, len = str.length;
      for (i = 0; i < len; i++) {
        var c = str[i];
        if (c === '#' || c === '/' && (str[i+1] === '/' || str[i+1] === '*')) break;
        else if (c > ' ') { str = '# ' + str; break; }
      }
      if (i < len) return " " + wrap(token.rem, str);
      else return str;
    }

    // What happens next depends on the value's type.

    // check for DSF
    var dsfValue = runDsf(value);
    if (dsfValue !== undefined) return wrap(token.dsf, dsfValue);

    switch (typeof value) {
      case 'string':
        return quote(value, gap, hasComment, isRootObject);

      case 'number':
        // JSON numbers must be finite. Encode non-finite numbers as null.
        return isFinite(value) ? wrap(token.num, String(value)) : wrap(token.lit, 'null');

      case 'boolean':
        return wrap(token.lit, String(value));

      case 'object':
        // If the type is 'object', we might be dealing with an object or an array or
        // null.

        // Due to a specification blunder in ECMAScript, typeof null is 'object',
        // so watch out for that case.

        if (!value) return wrap(token.lit, 'null');

        var kw, kwl; // whitespace & comments
        if (keepWsc) kw = value.__WSC__;

        var isArray = Object.prototype.toString.apply(value) === '[object Array]';
        var showBraces = isArray || !isRootObject || (kw ? !kw.noRootBraces : emitRootBraces);

        // Make an array to hold the partial results of stringifying this object value.
        var mind = gap;
        if (showBraces) gap += indent;
        var eolMind = eol + mind;
        var eolGap = eol + gap;
        var prefix = noIndent || bracesSameLine ? '' : eolMind;
        var partial = [];

        var i, length; // loop
        var k, v; // key, value

        if (isArray) {
          // The value is an array. Stringify every element. Use null as a placeholder
          // for non-JSON values.

          for (i = 0, length = value.length; i < length; i++) {
            if (kw) partial.push(wsc(kw[i]) + eolGap);
            partial.push(str(value[i], kw ? testWsc(kw[i + 1]) : false, true) || wrap(token.lit, 'null'));
          }
          if (kw) partial.push(wsc(kw[i]) + eolMind);

          // Join all of the elements together, separated with newline, and wrap them in
          // brackets.

          if (kw) v = prefix + wrap(token.arr, partial.join(''));
          else if (partial.length === 0) v = wrap(token.arr, '');
          else v = prefix + wrap(token.arr, eolGap + partial.join(eolGap) + eolMind);
        } else {
          // Otherwise, iterate through all of the keys in the object.

          if (kw) {
            kwl = wsc(kw.c[""]);
            var keys=kw.o.slice();
            for (k in value) {
              if (Object.prototype.hasOwnProperty.call(value, k) && keys.indexOf(k) < 0)
                keys.push(k);
            }

            for (i = 0, length = keys.length; i < length; i++) {
              k = keys[i];
              if (showBraces || i>0 || kwl) partial.push(kwl + eolGap);
              kwl = wsc(kw.c[k]);
              v = str(value[k], testWsc(kwl));
              if (v) partial.push(quoteKey(k) + token.col + (startsWithNL(v) ? '' : ' ') + v);
            }
            if (showBraces || kwl) partial.push(kwl + eolMind);
          } else {
            for (k in value) {
              if (Object.prototype.hasOwnProperty.call(value, k)) {
                v = str(value[k]);
                if (v) partial.push(quoteKey(k) + token.col + (startsWithNL(v) ? '' : ' ') + v);
              }
            }
          }

          // Join all of the member texts together, separated with newlines
          if (partial.length === 0) {
            v = wrap(token.obj, '');
          } else if (showBraces) {
            // and wrap them in braces
            if (kw) v = prefix + wrap(token.obj, partial.join(''));
            else v = prefix + wrap(token.obj, eolGap + partial.join(eolGap) + eolMind);
          } else {
            v = partial.join(kw ? '' : eolGap);
          }
        }

        gap = mind;
        return v;
    }
  }

  function hjsonStringify(value, opt) {
    var i, space;
    var dsfDef = null;

    eol = common.EOL;
    indent = '  ';
    keepWsc = false;
    bracesSameLine = false;
    emitRootBraces = true;
    quoteAlways = false;

    if (opt && typeof opt === 'object') {
      if (opt.eol === '\n' || opt.eol === '\r\n') eol = opt.eol;
      space = opt.space;
      keepWsc = opt.keepWsc;
      bracesSameLine = opt.bracesSameLine;
      emitRootBraces = opt.emitRootBraces !== false;
      quoteAlways = opt.quotes === 'always';
      dsfDef = opt.dsf;

      if (opt.colors === true) {
        token = {
          obj:  [ '\x1b[30;1m{\x1b[0m', '\x1b[30;1m}\x1b[0m' ],
          arr:  [ '\x1b[30;1m[\x1b[0m', '\x1b[30;1m]\x1b[0m' ],
          key:  [ '\x1b[33m',  '\x1b[0m' ],
          qkey: [ '\x1b[33m"', '"\x1b[0m' ],
          col:  [ '\x1b[37m:\x1b[0m' ],
          str:  [ '\x1b[37;1m', '\x1b[0m' ],
          qstr: [ '\x1b[37;1m"', '"\x1b[0m' ],
          mstr: [ "\x1b[37;1m'''", "'''\x1b[0m" ],
          num:  [ '\x1b[36;1m', '\x1b[0m' ],
          lit:  [ '\x1b[36m', '\x1b[0m' ],
          dsf:  [ '\x1b[37m', '\x1b[0m' ],
          esc:  [ '\x1b[31m\\', '\x1b[0m' ],
          uni:  [ '\x1b[31m\\u', '\x1b[0m' ],
          rem:  [ '\x1b[30;1m', '\x1b[0m' ],
        };
      }
    }

    runDsf = dsf.loadDsf(dsfDef, 'stringify');

    // If the space parameter is a number, make an indent string containing that
    // many spaces. If it is a string, it will be used as the indent string.

    if (typeof space === 'number') {
      indent = '';
      for (i = 0; i < space; i++) indent += ' ';
    } else if (typeof space === 'string') {
      indent = space;
    }

    // Return the result of stringifying the value.
    return str(value, null, true, true);
  }

  return hjsonStringify($value, $opt);
};

},{"./hjson-common":1,"./hjson-dsf":2}],5:[function(require,module,exports){
module.exports="2.1.0";

},{}],6:[function(require,module,exports){
/*! @preserve
 * Hjson v2.1.0
 * http://hjson.org
 *
 * Copyright 2014-2016 Christian Zangl, MIT license
 * Details and documentation:
 * https://github.com/hjson/hjson-js
 *
 * This code is based on the the JSON version by Douglas Crockford:
 * https://github.com/douglascrockford/JSON-js (json_parse.js, json2.js)
 */

/*

  This file creates a Hjson object:


    Hjson.parse(text, options)

      options {
        keepWsc     boolean, keep white space and comments. This is useful
                    if you want to edit an hjson file and save it while
                    preserving comments (default false)

        dsf         array of DSF (see Hjson.dsf)
      }

      This method parses Hjson text to produce an object or array.
      It can throw a SyntaxError exception.


    Hjson.stringify(value, options)

      value         any JavaScript value, usually an object or array.

      options {     all options are

        keepWsc     boolean, keep white space. See parse.

        bracesSameLine
                    boolean, makes braces appear on the same line as the key
                    name. Default false.

        emitRootBraces
                    boolean, show braces for the root object. Default true.

        quotes      string, controls how strings are displayed.
                    "min"     - no quotes whenever possible (default)
                    "always"  - always use quotes

        space       specifies the indentation of nested structures. If it is
                    a number, it will specify the number of spaces to indent
                    at each level. If it is a string (such as '\t' or '  '),
                    it contains the characters used to indent at each level.

        eol         specifies the EOL sequence (default is set by
                    Hjson.setEndOfLine())

        colors      boolean, output ascii color codes

        dsf         array of DSF (see Hjson.dsf)
      }

      This method produces Hjson text from a JavaScript value.

      Values that do not have JSON representations, such as undefined or
      functions, will not be serialized. Such values in objects will be
      dropped; in arrays they will be replaced with null.
      stringify(undefined) returns undefined.


    Hjson.endOfLine()
    Hjson.setEndOfLine(eol)

      Gets or sets the stringify EOL sequence ('\n' or '\r\n').
      When running with node.js this defaults to os.EOL.


    Hjson.rt { parse, stringify }

      This is a shortcut to roundtrip your comments when reading and updating
      a config file. It is the same as specifying the keepWsc option for the
      parse and stringify functions.


    Hjson.version

      The version of this library.


    Hjson.dsf

      Domain specific formats are extensions to the Hjson syntax (see
      hjson.org). These formats will be parsed and made available to
      the application in place of strings (e.g. enable math to allow
      NaN values).

      Hjson.dsf ontains standard DSFs that can be passed to parse
      and stringify.


    Hjson.dsf.math()

      Enables support for Inf/inf, -Inf/-inf, Nan/naN and -0.
      Will output as Inf, -Inf, NaN and -0.


    Hjson.dsf.hex(options)

      Parse hexadecimal numbers prefixed with 0x.
      set options.out = true to stringify _all_ integers as hex.


    Hjson.dsf.date(options)

      support ISO dates


  This is a reference implementation. You are free to copy, modify, or
  redistribute.

*/

/*jslint node: true */
"use strict";

var common = require("./hjson-common");
var version = require("./hjson-version");
var parse = require("./hjson-parse");
var stringify = require("./hjson-stringify");
var dsf = require("./hjson-dsf");

module.exports={

  parse: parse,
  stringify: stringify,

  endOfLine: function() { return common.EOL; },
  setEndOfLine: function(eol) {
    if (eol === '\n' || eol === '\r\n') common.EOL = eol;
  },

  version: version,

  // round trip shortcut
  rt: {
    parse: function(text, options) {
      (options=options||{}).keepWsc=true;
      return parse(text, options);
    },
    stringify: function(value, options) {
      (options=options||{}).keepWsc=true;
      return stringify(value, options);
    },
  },

  dsf: dsf.std,

};

},{"./hjson-common":1,"./hjson-dsf":2,"./hjson-parse":3,"./hjson-stringify":4,"./hjson-version":5}],7:[function(require,module,exports){

},{}]},{},[6])(6)
});