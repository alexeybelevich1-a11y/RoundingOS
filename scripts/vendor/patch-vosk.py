# Usage: python3 scripts/vendor/patch-vosk.py <npm vosk-browser 0.0.8 dist/vosk.js> vendor/vosk-browser/vosk.js
# The embedded worker builds functions from strings (new Function), which the app's CSP blocks.
# This swaps those three helpers for plain closures that do the same thing.
# Rebuilds vendor/vosk-browser/vosk.js from the npm file with two CSP fixes in its embedded worker.
import re, base64, sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src).read()
m = re.search(r"createBase64WorkerFactory\('([A-Za-z0-9+/=]+)'", s)
w = base64.b64decode(m.group(1)).decode('utf8')
old1 = 'function createNamedFunction(name,body){name=makeLegalFunctionName(name);return new Function("body","return function "+name+"() {\\n"+\'    "use strict";\'+"    return body.apply(this, arguments);\\n"+"};\\n")(body)}'
new1 = 'function createNamedFunction(name,body){return function(){"use strict";return body.apply(this,arguments)}}'
assert w.count(old1) == 1
w = w.replace(old1, new1)
a = w.index('function craftInvokerFunction(')
b = w.index('function heap32VectorToArray(')
new2 = ('function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){'
 'var argCount=argTypes.length;if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and \'this\' types!");}'
 'var isClassMethodFunc=argTypes[1]!==null&&classType!==null;var needsDestructorStack=false;'
 'for(var i=1;i<argTypes.length;++i){if(argTypes[i]!==null&&argTypes[i].destructorFunction===undefined){needsDestructorStack=true;break}}'
 'var returns=argTypes[0].name!=="void";var expected=argCount-2;'
 'return function(){if(arguments.length!==expected){throwBindingError("function "+humanName+" called with "+arguments.length+" arguments, expected "+expected+" args!");}'
 'var destructors=needsDestructorStack?[]:null;var callArgs=[cppTargetFunc];var thisWired;'
 'if(isClassMethodFunc){thisWired=argTypes[1].toWireType(destructors,this);callArgs.push(thisWired);}'
 'var wired=[];for(var j=0;j<expected;++j){wired.push(argTypes[j+2].toWireType(destructors,arguments[j]));callArgs.push(wired[j]);}'
 'var rv=cppInvokerFunc.apply(null,callArgs);'
 'if(needsDestructorStack){runDestructors(destructors);}else{for(var k=isClassMethodFunc?1:2;k<argTypes.length;++k){var p=k===1?thisWired:wired[k-2];if(argTypes[k].destructorFunction!==null){argTypes[k].destructorFunction(p);}}}'
 'if(returns){return argTypes[0].fromWireType(rv)}}}')
w = w[:a] + new2 + w[b:]
a = w.index('function __emval_get_method_caller(')
b = w.index('function __emval_incref(')
new3 = ('function __emval_get_method_caller(argCount,argTypes){var types=__emval_lookupTypes(argCount,argTypes);var retType=types[0];'
 'var caller=function(handle,name,destructors,args){var vals=[];var offset=0;'
 'for(var i=0;i<argCount-1;++i){vals.push(types[i+1].readValueFromPointer(args+offset));offset+=types[i+1]["argPackAdvance"];}'
 'var rv=handle[name].apply(handle,vals);'
 'for(var i=0;i<argCount-1;++i){if(types[i+1]["deleteObject"]){types[i+1].deleteObject(vals[i]);}}'
 'if(!retType.isVoid){return retType.toWireType(destructors,rv)}};'
 'return __emval_addMethodCaller(caller)}')
w = w[:a] + new3 + w[b:]
assert 'new Function' not in w and 'new_(Function' not in w
enc = base64.b64encode(w.encode('utf8')).decode()
open(dst, 'w').write(s[:m.start(1)] + enc + s[m.end(1):])
print('ok')
