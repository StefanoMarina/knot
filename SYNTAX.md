# JSON and OSC Syntax

## Welcome to JSON

JSON is a really simply human readable syntax. Simple tutorial and
explanations can be found [here](https://www.tutorialspoint.com/json/index.htm)  
or [here](https://www.w3schools.com/js/js_json_intro.asp).

You need to grasp only the basics, such as arrays (\[ \]) and objects "\{ \}".

Every property key should be lower case.

## A binding file

A binding file is a .json file with all the binds defined in it.

Since a binding is an array, every binding must be inside brackets:

```
[
  ... stuff ...
]
```

### Channel binding

Bindings are defined by channel first. A special *all* channel (lowercase!)
can be defined to create bindings. 

```json
[
  "1" : []
]
```
This is creating a binding for channel 1.

```json
[
  "all" : [],
  "1" : []
]
```

This will create two bind lists: one for all channels, and one specific
to channel 1.

Note that *all* channel binds are formulated as 16 different binds.


### Binding types

You can bind either a key or a CC to a binding.

There are 3 tipes of bindings: 
- **Triggers** will generate the osc command when CC value/note velocity is met exactly;
- **Faders** will generate the osc command while appending the CC/velocity value;
- **Selectors** are similar to triggers but they have multiple values/velocity to be bound.


Every bind file should be inside a JSON object. Binding type is defined as such:

```json
[
  "all" :[
    {
      "type": "trigger"
    },
    {
      "type": "trigger"
    }
  ],
  "1" : [
      "type" : "fader"
  ]
]
```

**Note**: type can be omitted. each of the 3 types requires a specific parameter
that will suggest Knot what type of bind you want:
- **Triggers** require the *trigger* property:
- **Faders** require the *fader* property;
- **Switches** require the *switch* property. Seeing a pattern here?

#### Defining MIDI event

As of 0.1 two events are supported: CC and noteon. CC are filtered by their
value, while noteon can be filtered by note pitch (data1) and velocity (data2).

```json
[
  "all" :[
    {
      "type": "trigger",
      "cc" : 15
    },
    {
      "type": "trigger",
      "note": 69
    }
  ],
  "1" : [
      "type" : "fader"
  ]
]
```

We now have two binds: CC 15 and A5 (noteon 69) on all channels. This is
actually 32 binds, 1 for each channel.

```json
[
  "all" :[
    {
      "type": "trigger",
      "cc" : 15
    },
    {
      "type": "trigger",
      "note": 69
    }
  ],
  "1" : [
      "type" : "fader"
  ]
]
```

#### Triggers
Triggers require the *trigger* property, which defines the CC value or the
velocity to be met. a trigger value of 0 means "any message". You can omit
trigger to be automatically set on 0.

```json
[
  "all" :[
    {
      "type": "trigger",
      "cc" : 15,
      "trigger" : 127
    },
    {
      "type": "trigger",
      "note": 69
    }
  ],
  "1" : [
      "type" : "fader"
  ]
]
```

Now the first bind triggers only when CC 15 is 127. Trigger two, on the
other hand, will trigger everytime A5 is pressed, no matter the velocity.

#### Faders
Faders can bind midi to osc in the same way triggers do, however they pass
a continuous value as the final OSC parameter. Supported *fader* modes are:

- *abs* : no conversion, value will be 1-127;
- *int* : integer, values will be converted to "min" and "max";
- *float* : float, values will be converted to "min" and "max";
- *bool* : this requires *max* only. If value is >= max, "T" will be send. if value is < max, "F" will be send.

When you do a conversion, you need two additional parameters: min and max. they define
the boundaries of the scale. They are not required for abs.

Since faders expect a value to be converted, the special word ``${val}`` should be put where
you want your value to be converted. See _Advanced Syntax_ for more info. Writing ``${-val}`` will
produce a conversion on a reversed value (value = 127 - value). If ``${val}`` is omitted, the Filter
will automatically append it on a fader.

```json
[
  "all" :[
    {
      "type": "trigger",
      "cc" : 15,
      "trigger" : 127
    },
    {
      "type": "trigger",
      "note": 69
    }
  ],
  "1" : [
      "type" : "fader",
      "cc" : 16,
      "fader" : "abs",
      "min" : "1",
      "max" : "64"
  ]
]
```

This will capture any CC 16 event, reduce the value from 1-127 (original midi)
to 1-64 (min and max) and send it. It will halve the original value.
 
Here is another example.

```json
{
  "cc": 100,
  "fader": "float",
  "min": -1,
  "max": 1
}
```

This will turn any CC value from CC 100 to a -1 / 1 value, and then the value is attached to the osc message.

```json
{
  "note": 69,
  "fader": "bool",
  "max": 90,
  "osc": "/distorsion"
}
```
Playing a A5 stronger than velocity 90 will enable distorsion ```/distorion T```, 
      while playing less than 90 will disable it ```/distortion F```.

#### Switches
A **Switch** is a special group of triggers bound on the same CC/Note.

```json
{
  "type" : "switch",
  "CC" : 100,
  "switch" : {
    "0" : "/mode 'poly'",
    "64": "/mode 'legato'",
    "127": "/mode 'mono'"
  }
}
```

This will set mono mode depending on the value received on CC 100. This is useful if
you want similar commands on the same trigger, i.e. on a knob.

Make sure you give enough room between each trigger and use arbitrary values
such as 0,32 (25%), 64 (50%), 98 (75%) or 127 (100%). Since the value needs to be **exact**,
a value of 63 will **not** trigger the osc command bound on 64.

### OSC 

The "osc" property defines the osc to be triggered.

```json
{
  "cc" :100,
  "fader": abs-,
  "osc": "/filter/cutoff"
}
```

This will send a reversed value from cc 100 to /filter/cutoff. If i receive
a value of 32 from cc 100, the final message will be ``/filter/cutoff 95``
(127-32).

if you need to put your fader score somewhere which is not the last parameter, put the special word
``${val}``.

```json
{
  "cc" :100,
  "fader": abs-,
  "osc": "/filter/cutoff ${val} 3"
}
```

this will put the value as the first parameter of the ``/filter/cutoff`` line instead of appending it.

#### Bundles

Sometimes you want to send multiple messages instead of a single one. This is really simple to do, just
use an array instead of a string:

```json
{
  "CC": 100,
  "trigger": 64,
  "osc" :[ "/panic", "/load_file 'xyz'" ]
}
```

This will, in order, trigger /panic and /load_file when CC 100 reaches 64.

### Shell commands

You can launch a shell script instead of an osc command:

```json
{
  "CC": 100,
  "trigger": 64,
  "command" : "/home/ste/test.sh"
}
```

**PLEASE BE EXTRA CAREFUL WITH THIS** and always check what are you executing.
KNOT cannot guarantee anything about commands. If you are using an external source,
or just want to be safe, you can disable shell commands (see documentation).

Also, bundles of commands are not supported. If you want to execute multiple
shell commands, write them inside a script, and launch the script via the *command* property.

### Special Syntax
You can use some special variables to complete and parse your OSC syntax and make it
more responsive to your midi Device.

All keywords must be put inside dollar sign ($) and brackets {} such as ``${val}``.

All keywords support the "-" sign, so ``${-ch}`` is 15-current channel.

| Keyword | Meaning |
|:------:|:--------:|
| ${val}  | Value as specified by the fader |
| ${ch}   | Channel as in 0-15 |
| ${CH}   | Channel as in 1-16 |
| ${sb}   | Status byte |
| ${d1}   | Data 1 byte (CC, note  or MSB)|
| ${d2}   | Data 2 byte (value, velocity or LSB )

Any other code between ${} will be applied directly.

Let's say I want a certain osc path for volume, say ``/instrument0/volume``, 
to be responsive to the CC channel. I want to do this on every channel, but I don't want to write 16 specific paths!

I can write ``/instrument${ch}/volume``, so the path will automatically become
``/istrument0/volume`` when played on channel 0, ``/istrument15/volume`` 
when played on channel 15.


## OSC Syntax

For an extensive reading on OSC syntax, [try here](http://wosclib.sourceforge.net/doc/_w_osc_lib_osc__spec__page.html).

Syntax support is pretty much depending on your software/device of choice. Knot just mindlessly sends data.
We will cover only knot's custom parsing requirements here.

However, some special addition to the default syntax is specified here, to make osc paths
more human-readable and suited for json.

None of the following is a OSC convention.

All parameters must stay in the same line:

```
"/path 'this is ok'"

"/path
'this is not'
"
```

And must be separated by a space ``/path 'this is ok' 3 1.5 T`` is ok,
``/path 'this is not'31.5T`` is not.

to force floats, always add a . to a number, i.e. 1.0.

### Strings and Blobs

Strings must be between single quotes ''. You could use double quotes, just remember to use \" inside a .json file.

Blobs are handled as strings in base64. ``/send 'base64;SGVsbG8gV29ybGQh'`` will send "Hello World!" as an array of bytes.


