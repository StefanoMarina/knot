# JSON and OSC Syntax

Every bind file should be inside a JSON object:
``
{
  .. stuff ..
}
``

This root object supports up to 17 different keys: a MIDI channel number or the special channel "all".

``
{
  "all" :[ <-- channels are arrays, so use [] not {}
    .. stuff that I want all channels to respond ..
  ], <-- mind the comma after each object/array!
  "1" : [
    .. only on channel 1 messages ..
  ],
  "16" : [
    .. only on channel 16 messages
  ]
}
``
There are basically two types of OSC commands: buttons (triggers) and faders.
They both can be bound to a CC or  note velocity. 

## Buttons and Faders
**Buttons** will do something when the CC is **exactly** the *trigger* value:

``
{
  "CC" : 100,
  "trigger : 64,
  "osc" :  "/panic"
}
``
This will send the /panic osc message when a CC message when a CC 100 change message is sent
with 64 as the new value. If *trigger* is not specified, 0 is assumed (any event).

You may also use a key instead of a CC:
``
{
  "note" : 69,
  "osc" : "/panic"
}
``
This will trigger a ``/panic`` osc message if A5 is pressed. if *trigger* is specified, velocity will be evalutated.

This can be useful in some scenario, i.e. a keyboard with no velocity that you want to turn into a CC.

**Faders** will send OSC messages by adding or converting *CC* or *note* to a value. The special parameter *fader* is used, with 
the following values:

- *abs* : no conversion, value will be 1-127;
- *int* : integer, values will be converted to "min" and "max";
- *float* : float, values will be converted to "min" and "max";
- *bool* : this requires *max* only. If value is >= max, "T" will be send. if value is < max, "F" will be send.

Each one of those modes has a **reverse mode**: the byte will be reversed by doing 127-byte value. The reverse mode is indicated
by the minus sign "-" after the mode. So,"abs-" will reverse the value and handle it directly, "bool-" will revert the value before cheking if it
is more than max, etc.

``
{
  "CC": 100,
  "fader": "float",
  "min": -1,
  "max": 1
  "osc": "/oscillator"
}
``
This will turn any CC value from CC 100 to a -1 / 1 value, and then the value is attached to the osc message.

``
{
  "note": 69,
  "fader": "bool",
  "max": 90,
  "osc": "/distorsion"
}
``
Playing a A5 stronger than velocity 90 will enable distorsion ```/distorion T```, 
      while playing less than 90 will disable it ```/distortion F```.

## Selectors
A **Selector** is a special group of triggers bound on the same CC/Note.

``
{
  "CC" : 100
  "selector" : {
    "0" : "/mode 'poly'",
    "64": "/mode 'legato'",
    "127": "/mode 'mono'"
  }
}
``

This will set mono mode depending on the value received on CC 100. This is useful if
you want similar commands on the same trigger, i.e. on a knob.

Make sure you give enough room between each trigger and use arbitrary values
such as 0,32 (25%), 64 (50%), 98 (75%) or 127 (100%). Since the value needs to be **exact**,
a value of 63 will **not** trigger the osc command bound on 64.

## Manipulating syntax

if you need to put your fader score somewhere which is not the last parameter, mark it with a '%' sign.

``
{
  "cc" :100,
  "fader": abs-,
  "osc": "/filter/cutoff % 3"
}
``

this will put a reverse mode of absolute (so 127-value) as the first parameter of the ``/filter/cutoff`` line.

### Bundles

Sometimes you want to send multiple messages instead of a single one. This is really simple to do, just
use an array instead of a string:

``
{
  "CC": 100,
  "trigger": 64,
  "osc" :[ "/panic", "/load_file 'xyz'" ]
}
``

This will, in order, trigger /panic and /load_file when CC 100 reaches 64 or more.

### Shell commands

You can launch a shell script instead of an osc command:

``
{
  "CC": 100,
  "trigger": 64,
  "command" : "/home/ste/test.sh"
}
``

**PLEASE BE EXTRA CAREFUL WITH THIS** and always check what are you executing.
KNOT cannot guarantee anything about commands. If you are using an external source,
or just want to be safe, you can disable shell commands (see documentation).

Also, bundles of commands are not supported. If you want to execute multiple
shell commands, write them inside a script, and launch the script via the *command* property.

## OSC Syntax

For an extensive reading on OSC syntax, [try here](http://wosclib.sourceforge.net/doc/_w_osc_lib_osc__spec__page.html).

Syntax support is pretty much depending on your software/device of choice. Knot just mindlessly sends data.

All parameters must stay in the same line:

``
"/path 'this is ok'"

"/path
'this is not'
"
``

And must be separated by a space.

### Strings and Blobs

Strings must be between single quotes ''. You could use double quotes, just remember to use \" inside a .json file.

Blobs are handled as strings in base64. ``/send 'base64;SGVsbG8gV29ybGQh'`` will send "Hello World!" as an array of bytes.


