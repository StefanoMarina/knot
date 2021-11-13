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
const EventEmitter = require('events');

var exports = module.exports = {};

class Knot extends EventEmitter{
  
  constructor(oscPort) {
    super();
    this.osc = oscPort;
    this.parser = new OSCParser.OSCParser();
    this.emitOnly = false;
  }

  
  
  /**
   * sets "emit only" mode. In emit only mode, osc is never send and
   * commands are never executed, only events are triggered. this is
   * useful if you want to use Knot as a "dispatcher" rather than a
   * standalone app.
   * @param value sets the emit only mode
   * @return the current emit only mode (before changing)
   */
  setEmitOnly(value) {
    this.emitOnly = value;
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
   * @param preserve  (optional) (default=false) if true, the new configuration will be overimposed without
   * overwriting conflicting bindings with the current filtermap.
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
        this.filterMap = Filters.FilterMap.merge(this.filterMap, 
            new Filters.FilterMap(newConfiguration, disableShell, false), preserve);
      } else {
        try {
          this.filterMap = new Filters.FilterMap(newConfiguration, disableShell,false);
        } catch (err) {
          throw `error in creating filter ${configuration.indexOf(cfg)}: ${err}`;
        }
      }
    }, this);
  }
  
  /**
   * @param request can be a number, in which case it will be opened directly,
   * a string,in which case it will be looked with presence (it is not required to be the
   * full string), or a Input object, in which case it will be simply referenced.
   */
  setMidi(request) {
    if (this.midi !== undefined) {
      this.midi.closePort();
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
        this.midi.ignoreTypes(false, false, false);
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
  
  /**
   * Sets a Output for any midi message that is not intercepted.
   * @param midiOut a midi output
   */
  setMidiOut(midiOut) {
    this.midiOut = midiOut;
  }
  
  midiCallback(delta, message)  {
   if (this.filterMap === undefined) {
      if (this.midiOut != null) {
        //console.log(`redirecting ${message}...`);
        this.emit('midi', delta, message);
        this.midiOut.sendMessage(message);
      }
      return;
   }
    
    let outcome = this.filterMap.process(message);
    
    //console.log(`filtered ${JSON.stringify(message)} : ${JSON.stringify(outcome)}`);
    
    if (outcome !== false && outcome !== undefined) {
      
      let request = null;
      
      this.emit('filter', outcome, delta, message);
      
      for (let i = 0; i < outcome.length; i++) {
        request = outcome[i];
        switch (request.type) {
          case "command" :
            this.emit('command', request.path, delta, message);
            if (!this.emitOnly) exec (request.path);
          break;
          case "osc":
            this.emit('osc', request.path, delta, message);
            if (this.osc != null && !this.emitOnly) {
              try {  
                this.osc.send(this.parser.translate(request.path));
              } catch (err) {
                console.log(`bad osc message for ${request.path}: ${err}`);
              }
            }
          break;
          default : break;
        } 
      }
    } else {
      this.emit('midi', delta, message);
      if (this.midiOut != null)
        this.midiOut.sendMessage(message);
    }
  }
  
  getOSC() {return this.osc;}
}

/*
 * Module exports
 */

exports.Knot = Knot;
exports.Filter = Filters.Filter;
exports.FilterMap = Filters.FilterMap;
exports.OSCParser = OSCParser.OSCParser;
exports.MIDIParser = OSCParser.MIDIParser;
