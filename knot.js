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
const {execSync, exec} = require("child_process");

var exports = module.exports = {};

exports.Knot = class {
  
  constructor(oscPort) {
      this.osc = oscPort;
  }

  /**
   * sets filterMap to null. this must be called if the old configuration
   * is to be discarded entirely.
   */
   clear() {this.filterMap = null;}
  
  /**
   * Parse a configuration file and creates the FilterMap object.
   * @param configuration string with a path to a .json file or FilterMap object. This can also be a mixed array,
   * in which case every filter is loaded.
   * @param preserve  (optional) if configuration is a FilterMap, this determine
   * the merge mode. Default is false - new binds will override the old ones.
   * @param disableShell (default=false) any filterMap will disregard filters with shell commands.
   * @throws error on loading, parsing or sanitizing
   */
  loadConfiguration(configuration, preserve, disableShell) {
    
    if (!Array.isArray(configuration))
      configuration = [configuration];
    
    var newConfiguration;
    
    if (undefined === disableShell) disableShell = false;
    
    configuration.forEach ((cfg) => {    
      
      if (typeof cfg == "string") {
        try {
          let data = Fs.readFileSync(cfg);
          newConfiguration = JSON.parse(data);
        } catch (err) {
          throw `error in loading ${cfg}: ${err}`;
        }
      } else
        newConfiguration = cfg;
    
      if (this.filterMap !== undefined && this.filterMap !== null) {
        if (preserve === undefined) preserve = false;
        this.filterMap = FilterMap.merge(this.filterMap, new Filters.FilterMap(newConfiguration, disableShell), preserve);
      } else {
        try {
          this.filterMap = new Filters.FilterMap(newConfiguration, disableShell);
        } catch (err) {
          throw `error in creating filter ${configuration.indexOf(cfg)}: ${err}`;
        }
      }
    }, this);
    
    if (this.parser === undefined)
      this.parser = new OSCParser.OSCParser();
  }
  
  /**
   * @param request can be a number, in which case it will be opened directly,
   * a string,in which case it will be looked with presence (it is not required to be the
   * full string), or a Input object, in which case it will be simply referenced.
   */
  setMidi(request) {
    if (this.midi !== undefined) {
      this.midi.closePort();
      this.midi.release(); //seems useful for avoiding ALSA resource problem
      this.midi = undefined;
    }
    
    this.deviceID = null;
   
    if (typeof request != "object") {
      this.midi = new MIDI.Input();
      
      if (typeof request == "number")
        this.deviceID = request;
        
      else if (typeof request == "string") {
        let ports = this.midi.getPortCount();
        let rxDevice= new RegExp(request, 'gi');
        let deviceName;

        for (let i = 0; i < ports; i++) {
          deviceName = this.midi.getPortName(i);
          if (deviceName.match(rxDevice)) {
            this.deviceID = i;
            break;
          }
        }
      }
      if (this.deviceID == null)
        throw `Cannot find device id for request ${request}`;
      
      try {
        this.midi.openPort(this.deviceID);
      } catch (err) {
        throw `Cannot open midi port ${deviceID}: ${err}`;
      }
      
    } else {
      this.midi = request;
    }
    
    this.midi.on('message', (delta, msg) =>{
        this.midiCallback(delta, msg);
    });
  }
  
  getMidi() {return this.midi;}
  
  midiCallback(delta, message)  {
   if (this.filterMap === undefined) {
      console.log("warning: empty filter map.");
      return;
    }
    let outcome = this.filterMap.process(message);
    
    console.log(`filtered ${JSON.stringify(message)} : ${JSON.stringify(outcome)}`);
    
    if (outcome !== false && outcome!== undefined) {
      switch (outcome.type) {
        case "command" :
          exec (outcome.path);
        break;
        case "osc":
          if (this.osc === undefined)
            return;
          
          try {  
            this.osc.send(this.parser.translate(outcome.path));
          } catch (err) {
            console.log(`bad osc message for ${outcome.path}: ${err}`);
          }
        break;
      }
    }
  }
  
  getOSC() {return this.osc;}
}
