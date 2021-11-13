# Knot
Node.js midi-osc generator and binder

Knot is a node that *binds* . get it? no?

Knot is meant as a parallel process between regular device - synth application. 
It allows multiple configurations to be loaded and expand regular midi
controllers capability.

As a musician, i use a lot of controllers, and a lot of soft synths. 
sometimes i go with my headless pi to some friend's house and plug
their controller, whatever will be.

I also use a lot of vsts, none of them respecting any standard. CC 74
as resonance? I wish!

And to be honest, controller configuration is so painful and sometimes
frustrating that it's just not worth the time.

Knot allows me to have multiple configurations to be loaded real time,
without having to change something inside the hardware. It is meant
to work not as a middle man but as an additional source for osc based
synths and applications:

1. One or more bind files in .json format are opened and put together in one filter map;
2. An OSC UDP channel is opened;
3. MIDI inputs are opened via the npm midi package;
4. Knot listens to the device; anytime a note or a cc is found in the bind files, corresponding osc messages (or shell scripts) are run.
5. If a midi output is set, Knot will write any non filtered message in the midi output.

There is an app.js file to be used as a process, type ``node app.js`` for more info on usage.

Why "knot"? well, it's a node that binds... sorry.
## Use knot in your applications

### OSC
See SYNTAX.md for binding syntax.

As a standalone class, knot works pretty simply:

```
const KNOT = require ('./knot.js');
//open your OSC UDP channel
const knot = new KNOT.Knot(/* optional oscChannel */);
```

open up a configuration by loading one or more json files: 

```
try {
  knot.loadConfiguration(["file1.json", "file2.json"]);
} catch (err) {
  console.log(`Configuration error: ${err}`);
}
```

Knot may work without an osc port opened. Only the 'osc' message will be emitted then.

### Configurations
#### Preserve mode
Knot mixes bind maps when you try to load more than one.
When you load a bind map over an existing one, conflicting binds are handled
by discarding the original bind. With presere mode, the previous map will be kept
in full.

```
try {
  //this will remove any bind found in file1.json already presentin file1_alternate.json
  knot.loadConfiguration(["file1.json", "file1_alternate.json"], false);

  //this will keep all binds from current map and merge them with the new file
  knot.loadConfiguration("file1_alternate2.json", true);
} catch (err) {
  console.log(`Configuration error: ${err}`);
}
```

### Disable shell
If you need extra security, add true as a 3rd parameter on loadConfiguration. this will remove
any "shell" bind from the configuration.

```
try {
  //this will remove any  shell bind in file.json1
  knot.loadConfiguration("file1.json", false, true);
} catch (err) {
  console.log(`Configuration error: ${err}`);
}
```

## Midi stuff

### Open midi

Knot use the ``setMidi(request)`` method to enable, open and listen to a midi input port:

``request`` can be:
- an integer; in this case, Knot will assume it is a device id;
- a string; in this case, Knot will enumerate all midi inputs and will
bind to the first matching ``request``;
- a MIDI.Input object, in which case it is simply referenced.

If midi input is instantiated by knot, it will be also opened. the special
``midiCallback`` method is used to process and filter bindings.

```
  knot.setMidi("AKAI"); //bind to the first 'akai' device
  knot.setMidi(0); //bind to device #0;
  knot.setMidi(alreadyBuildInput); //reference custom midi input
  
  knot.midi.on('message', (delta, midiMessage) => {
    console.log('I want to listen to midi too!');
  });
```
and that's it, knot will start converting and sending osc.

### Midi out
You can set a Midi.Output object as a filtered port through the ``setMidiOutput(out)`` method.
when midi messages are filtered, any midi message that is not filtered by a bind will be written
on the midi output. By default, filtered midi messages are never sent to the output, even if they are
not triggered.

## Filters 

Any weird thing you want to do the bindings, you can get the ``filterMap`` property: 

```
  const KNOT = require('./knot.js');
  const filterMap = knot.filterMap.filterMap;

  //constructor takes channel and bind object
  let myFilter = new KNOT.Filter("all", myJsonObject); //parse your json

  let myBind = {"cc" : 74, "trigger" : 127, "osc" : "/panic"};

  //empty filtermap
  let myMap = new KNOT.FilterMap(null);

  myMap.addFilter(myFilter);
  myMap.add("all", myBind);


  //merges 2 filtermaps
  let mergedMap = KNOT.FilterMap.merge(filterMap, myMap);

```

A filterMap is a multi layer object. status byte binds are turned into properties,
with the special "11A" and "8A" for CC and noteon on "all" channels respectively.

Each "status property" has a "data1" property, which is the note or the CC. Those properties
contains arrays of filters, that are parsed through ``Filter.accepts`` and ``Filter.process``.
Note that a Filter object does not reflect the structure of a bind object. Bind objects are meant
to be more pratical on writing, while Filters try to be practical on access.

### Example of a FilterMap.filterMap property
```
{
  "11A" : {"74" : [ *filter1*, *filter2* ] }
}
```
## Events

if you use Knot ``midiCallback`` to process filters, the following events will be emitted:

| Event | Meaning| Params|
|:-----:|:------|:-------|
| midi  | unfiltered midi message | *delta* delta time , *message* midi message |
| filter| a generic filter(s) has been matched | *filters* list of triggered filters, *delta*, *message* |
|command| a shell command is executed | *command* shell command, *delta*, *message* |
| osc | a osc packet/message is to be send | *osc* osc packet or message, *delta*, *message* |

### EmitOnly mode

If you want to use Knot as an event dispatcher, disregarding shell or osc, just call ``setEmitOnly(true)``. Knot
will not send or execute anything. To discard midi re-routing, just ``setMidiOut(null)``.

## Parsers

Knot uses SimpleTextParser to handle OSC syntax and to parse midi messages with ${} paths.

```
const KNOT = require('./knot.js');
let myParser = new KNOT.OSCParser();
let result = myParser.translate("/myosc 'string' 2 3.0 T");
console.log(result);
let manyResults = myParser.translateLines(["/panic", "/load 'myfile.file'"]);

```

see SYNTAX.md for more information on OSC syntax for KNOT.

MIDI Parsers are used internally, but you can use them to extend midi message syntax on OSC.
MIDI Parsers are used by Filters. If ``Filter.parser`` is set, you can use a custom midi parser.
Note that new rules should follow your own syntax, the ${} syntax is reserved.

```
const KNOT = require('./knot.js');
let myMidiParser = new KNOT.MIDIParser();
myMidiParser.addRule(/*add your own rule*/);

//This iterates through all filters
knot.filterMap.filterEach ( (filter) => {filter.parser = myMidiParser;});

```

