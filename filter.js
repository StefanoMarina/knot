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

var exports = module.exports = {};

const Parsers = require ("./parser.js");

/**
 * Filters are used to check if a midi message is required to be converted
 * to OSC or shell messages.
 * They are built upon json objects from json configuration.
 * Note that a filter in itself does not check if shell mode is disabled,
 * this is done through the FilterMap object initialization. custom Filter
 * handling should be considering this.
 */
exports.Filter = class {
  
  /**
   * Filter constructor
   * @param channel must be "all" or a number between 1 and 16.
   * @param bind is an object built from json configuration or null for an empty filter.
   */
  constructor(channel, bind) {
 //   this.bind = bind;
    this.status = [];
    
    if (bind == null) return;
    
    if (isNaN(channel))
      this.channel = "all";
    else
      this.channel = Number(channel);
    
    // Status byte - this is where channel matters
    
    let bStatus = 0;
      
    if (undefined !== bind.cc) {
      //11A is used as a default channel for all (176 >> 4)
      this.status = ("all" != channel ? 175+this.channel : "11A");
      this.data1 = Number(bind.cc);
    } else if (undefined !== bind.note) {
      this.status = ("all" != chanell ? 143+this.channel : "9A");
      this.data1 = Number(bind.note);
    } else
      throw "Filter has no cc or noteon event";
    
    // data2 byte - this will be filtered if a fader is used instead of a trigger.
    if (undefined !== bind.trigger) {
      this.cutoff = bind.trigger;
      this.type = "trigger";
    } else if (undefined !== bind.fader) {  
      this.cutoff = 0;
      this.type = bind.fader;
      this.min = (bind['min'] !== undefined) ? bind['min'] : 0;
      this.max = (bind['max'] !== undefined) ? bind['max'] : 0;
      
    } else if (undefined !== bind.switch) {
      this.type = "switch";
      this.events = bind.switch;
    }
    
    if (this.type != "switch") {
      if (bind.osc !== undefined) {
        this.outcome = { "type" : "osc" , "path" : bind.osc };
        
        //faders requires ${val} to be present
        if (this.type != "trigger") {
          if (Array.isArray(this.outcome.path)){
            this.outcome.path = bind.osc.map ( (item) =>{
              return (!item.match(/\$\{val\}/g))
                  ? item + " ${val}" : item;
            });
          } else if (!this.outcome.path.match(/${val}/g))
            this.outcome.path = bind.osc + " ${val}";
        }
        
      } else { 
        this.outcome = { "type" : "command" , "path" : bind.command };
      }
    }
  }
  
  /**
   * tells if a message would trigger a process.
   * @return true if the midi message is accepted
   */
  accepts(midiMessage) {
    return (  ("all" != this.channel
                ? this.status == midiMessage[0]
                : this.status == `${midiMessage[0] >> 4}A`)
              && (this.data1 == midiMessage[1])
              && ( (this.type == "trigger")
                    ? (midiMessage[2] == this.cutoff)
                    : true
                 )
              && ( (this.type == "switch")
                    ? this.events[midiMessage[2]] !== undefined
                    : true
                 )
            );
  }
  
  /**
   * process a midi message already validated with accepts();
   * @midiMessage is a midi compatible array
   * @return the outcome
   */
  process(midiMessage) {
    var score = midiMessage[2], revScore = 127 - midiMessage[2];
    
    switch (this.type) {
      case "trigger": return this.outcome;
      case "switch": 
        return {type: "osc", path: this.events[score]};
      case "abs" : break;
      case "int":
        score = Math.floor (
              (score/127)*(this.max-this.min)+this.min
            );
      break;
      case "float":
      score = Math.round (
              ((score/127)*(this.max-this.min)+this.min)
            *10) / 10;
      break;
      case "bool":
        score = (score >= this.max) ? "T" : "F";
      break;
      default:
        throw `undefined mode ${this.type}`;
    }
    
    // faders need to update osc path
    var result = { "type" : this.outcome.type};
    
    let parser = new Parsers.MIDIParser();
    parser.setMidiMessage(midiMessage);
    parser.setValue(score);
    
    if (Array.isArray(this.outcome.path)) {
      result.path = [];
      for (let i = 0; i < this.outcome.path.length; i++) {
        result.path[i] = parser.render(this.outcome.path[i]);
      }
    } else {
      result.path = parser.render(this.outcome.path);
    }
    return result;
  }
   
  /**
   * Cleans a configuration from common errors (upper case) and
   * throws exception if configuration is invalid
   * @return new object, sanitized version of entry
   */
   
  static sanitize(entry) {
    
    //lower case every key
    var result =  Object.fromEntries(Object.entries(entry).map(
                                      ([k, v]) => [k.toLowerCase(), v])
                  );
    
    //osc or shell required
    if (undefined === result.osc && undefined === result.command
          && undefined === result["switch"])
      throw "missing osc or shell parameter in non-switch";
      
    if (undefined === result.cc && undefined === result.note)
      throw "missing cc or note event";
    
    if (undefined !== entry.cc)
      result.cc = Number(entry.cc);
    if (undefined !== entry.note)
      result.note = Number(entry.note);
      
    if (undefined === entry.trigger &&
            undefined === entry.fader && 
                undefined === entry.switch)
      throw "missing trigger, fader or switch";
    
    if (result.fader !== undefined) {
      result.fader = result.fader.toLowerCase();
      
      if (result.command !== undefined)
        throw "cannot bind a fader to a command";
      
      if (result.fader.indexOf("abs") == -1) {
        if (undefined === result.max)
          throw "missing max with fader";
        if (undefined === result.min && "bool" != result.fader)
          throw "missing min with fader";
      }
      
      if (result.fader.match(/(int|bool|float|abs)-?/gi) == null)
        throw "unrecognized fader " + result.fader;
    } else if (undefined !== entry.trigger){
      result.trigger = Number(entry.trigger);
    }
    
    return result;
  }
}


/**
 * The FilteMap class turns a configuration file into a bunch of
 * Filter objects.
 * Filter mapping is done via 2 arrays: the first array is defined by
 * the status byte, and contains a bunch of data1 array bytes, that defines
 * the filter. Only 1 filter per data1 is permitted, while you can have up to
 * 16 data filters
 * The last filter is stashed as reference and parsed first; this speeds up
 * faders, in theory.
 */

exports.FilterMap = class {

  /**
   * @param configuration should be an object wrote under the SYNTAX.md json syntax.
   * if null, an empty filter is created.
   * @param disableShell (default: false) will remove any filter with a shell command.
   */
  constructor(configuration, disableShell) {
    this.filterMap = {};
    
    if (undefined === disableShell) disableShell = false;
    this.shellDisabled = disableShell;
    
    if (configuration == null) return;
    
    var channels = Object.keys(configuration);  
    var filterArray;
    var filter;
    var stString, d1String;
    
    channels.forEach ( (channel) => {
      filterArray = configuration[channel];
      filterArray.forEach ( (json_filter) => {
          
          try {
            json_filter = exports.Filter.sanitize(json_filter);
            
            if (undefined !== json_filter.command && disableShell)
              return;
              
            filter = new exports.Filter(channel, json_filter);
          } catch (err) {
            console.log(`Error with filter ${JSON.stringify(json_filter)}: ${err}. Skipping.\n`);
            return;
          }
          
          let status = filter.status;
          if (undefined === this.filterMap[status])
            this.filterMap[status] = {};
          if (this.filterMap[status][filter.data1] === undefined) {
            this.filterMap[status][filter.data1] = [];
          }
          
          this.filterMap[status][filter.data1].push(filter);
      }, this);
    }, this);
  }
  
  /**
   * returns the filter map property
   * @return filter map
   */
  getMap(){return this.filterMap};
  
  
  /**
   * process a midi message
   * @param midiMessage a midi message in [Status, D1, D2] format
   * @return an array of filtered results with { "type" , "path" } , which may be empty,
   * meaning that filters are present but no event triggered, false if no filter was
   * present.
   */
   process(midiMessage) {
      
     let allChannels = `${midiMessage[0]>>4}A`;
     let filterList = null;
    
     //look up for the last filter or clear it
     if (this.lastFilter != null && this.lastFilter.length > 0
            && (this.lastFilter[0].accepts(midiMessage))) {
        filterList = this.lastFilter;
      } else
        this.lastFilter = null;
            
    //look up generic and specific filters
    if (filterList == null) {
      if (this.filterMap[allChannels] != null &&
        this.filterMap[allChannels][midiMessage[1]] !== undefined) {
        filterList = this.filterMap[allChannels][midiMessage[1]];
      }
      
      if (this.filterMap[midiMessage[0]] != null &&
          this.filterMap[midiMessage[0]][midiMessage[1]] !== undefined) {
          filterList = (filterList == null)
              ? this.filterMap[midiMessage[0]][midiMessage[1]]
              : [...filterList, ...this.filterMap[midiMessage[0]][midiMessage[1]]]
      }
    }
    
    if (filterList == null)
      return false;
      
    let filter = null;
    let outcome = null;
    let result = [];
     
    for (let i = 0; i < filterList.length; i++) {
      filter = filterList[i];
       if (filter.accepts(midiMessage)){
         this.lastFilter = filterList;
         result.push(filter.process(midiMessage));
       }
    }
     
    return result;
   }   
   
   /**
    * Produces an output of the current map for debugging
    */
   toString() {
     var result = {};
     
     let status = 0;
     let channel = 0;
     let nKey = "";
     let type = "";
     
     for (let key in this.filterMap) {
        status = isNaN(key) ? Number(key.substr(0,2)) : (key >> 4);
        channel = isNaN(key) ? 'A' : (key & 0xf);
        type = (status == 11) ? "CC" : "note";
        
        for (let subKey in this.filterMap[key]) {
          nKey =`Chan ${channel}/${type}/${subKey}`;  
          result[nKey] = JSON.stringify(this.filterMap[key][subKey]);
        }
     }
     
     return result;
   }
   
   /**
    * Merges two filters, according to the rules specified by the method parameter
    * @param source source filtermap
    * @param additional additional filtermap
    * @param preserve if true, source's filters will not be removed when they
    * match with additional filter (match is on data1).
    * @return new object. Note that any actual filter is referenced and not cloned
    * into the new object.
    */
    static merge(source, additional, preserve) {
      if (preserve === undefined)
        preserve = false;
      
      let newFilterMap = new exports.FilterMap(null, source.disableShell);
      
      let sMap = source.filterMap, aMap = additional.filterMap;
      let nMap = newFilterMap.filterMap = {...sMap};
      
      let statusKeys = Object.keys(aMap);
      
      statusKeys.forEach( (skey)=> {
        if (nMap[skey] === undefined) {
          nMap[skey] = aMap[skey];
        } else {
          let d1Keys = Object.keys(aMap[skey]);
          d1Keys.forEach( (d1key) => {
            nMap[skey][d1key] = (nMap[skey][d1key] == null || !preserve)
              ? aMap[skey][d1key]
              : nMap[skey][d1key].concat(aMap[skey][d1key]);
          });
        }
    });
    return newFilterMap;
  }
}
