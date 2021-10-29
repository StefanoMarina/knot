/***********************************************************************
(c) Copyright 2021 by Stefano Marina.

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject
to the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR
ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**********************************************************************/

const Fs = require('fs');
const Filters = require('./filter.js');
const MIDI = require('midi');
const OSC = require ('osc');
const OSCParser = require ('./parser.js');

const KNOT = require('./knot.js');

function printHelp() {
  console.log('node knot.js [device] [osc url or "null" ] [-pdl] [one or more config files]');
  console.log('device: may be a number or a string, knot will try to match (see -l)');
  console.log('osc: may be null or osc url (IP:port)');
  console.log('-p: preserve previous binds on conflict (default: false)');
  console.log('-d: disable shell commands (default: false)');
  console.log('-l: list midi devices');
}

const app = {"args" : process.argv.slice(2)};

if (app.args.indexOf("-l")>=0) {
  let inputDevices = new MIDI.Input();
  let count = inputDevices.getPortCount();
  for (let i = 0; i < count; i++)
    console.log(`${i}: ${inputDevices.getPortName(i)}`);
  
  return;
}

if (app.args.length < 3) {
  printHelp();
  return;
}

// OSC 
address = app.args[1];
if ("null" != address.toLowerCase()) {

  let index = address.indexOf(":");
  if (index < 0) {
   console.log("Missing port on ip4");
   printHelp();
   return;
  }
  let port = address.substring(index+1);
  address = address.substring(0,index);
 
  app.osc = new OSC.UDPPort({
      localAddress: address,
      localPort: port+1,

      remoteAddress: address,
      remotePort: port,
      metadata: true
    });
} else {
  app.osc = null;
}
 
app.knot = new KNOT.Knot(app.osc);

//Configuration
let preserve = (app.args.indexOf("-p")>=0);
let disable = (app.args.indexOf("-d")>=0);

let configs = app.args.slice(2+preserve);
try {
    app.knot.loadConfiguration(configs, preserve);
    if (app.knot.filterMap=== undefined
          || app.knot.filterMap.getMap().length == 0)
        throw "Configuration had an empty mapping";
} catch (err) {
  console.log(`Configuration loading error: ${err}. Aborting.`);
  return;
}


//launch osc
if (app.osc != null) {
   app.osc.on('ready', () => {
        console.log ("Opened OSC Server");
    })
    
    app.osc.on('error', (err) => {
      throw `OSC ERROR: ${err}`;
      app.knot.midi.closePort();
    });
    app.osc.open();
}

try {
  app.knot.setMidi(app.args[0]);
  console.log("opened midi");
} catch (err) {
  console.log(`error on opening midi device: ${err}`);
}
/*
app.knot.midi.on('message', (delta,msg) => {
  console.log(`MIDI: (${delta}) - ${JSON.stringify(msg)}`);
});
*/
console.log(JSON.stringify(app.knot.filterMap.toString(),null, 2));
