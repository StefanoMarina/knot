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
    this.bind = bind;
    this.status = [];
    
    if (bind == null) return;
    
    if (isNaN(channel))
      this.channel = "all";
    else
      this.channel = channel;
    
    // Status byte - this is where channel matters
    
    let bStatus = 0;
      
    if (undefined !== this.bind.cc) {
      bStatus = 176;
      this.data1 = Number(bind.cc);
    } else if (undefined !== this.bind.note) {
      bStatus = 144;
      this.data1 = Number(bind.note);
    } else
      throw "Filter has no cc or noteon event";
    
    if (this.channel == "all") {
      let bMax = bStatus+16;
        do {this.status.push(bStatus++)} while (bStatus < bMax);
    } else
      this.status.push(bStatus + (Number(this.channel)-1));
    
    // data1 byte - this is used for cc / note number
    
    // data2 byte - this will be filtered if a fader is used instead of a trigger.
    if (undefined !== this.bind.trigger) {
      this.cutoff = this.bind.trigger;
      this.type = "trigger";
    } else if (undefined !== this.bind.fader) {  
      this.cutoff = 0;
      this.type = this.bind.fader;
    } else if (undefined !== this.bind.switch) {
      this.type = "switch";
      this.events = this.bind.switch;
    }
    
    if (this.type != "switch") {
      if (bind.osc !== undefined) {
        this.outcome = { "type" : "osc" , "path" : bind.osc };
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
    return (this.status.indexOf(midiMessage[0]) >= 0 
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
              (score/127)*(this.bind.max-this.bind.min)+this.bind.min
            );
      break;
      case "float":
      score = Math.round (
              ((score/127)*(this.bind.max-this.bind.min)+this.bind.min)
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
    
    if (Array.isArray(this.outcome.path)) {
      result.path = [];
      for (let i = 0; i < this.outcome.path.length; i++) {
        result.path[i] = (this.outcome.path[i].match(/ -?%/g))
                  ? this.outcome.path[i].replace(/ -%/gi,` ${revScore}`)
                    .replace(/ \%/gi,` ${score}`)
                  : `${this.outcome.path[i]} ${score}`;
      }
    } else { 
      result.path = (this.outcome.path.match(/ -?%/g))
                  ? this.outcome.path.replace(/ -%/gi, ` ${revScore}`)
                    .replace(/ \%/gi, ` ${score}`)
                  : `${this.outcome.path} ${score}`;
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
          
           filter.status.forEach( (status) => {
              if (undefined === this.filterMap[status])
                this.filterMap[status] = {};
              if (this.filterMap[status][filter.data1] === undefined) {
                this.filterMap[status][filter.data1] = [];
              }
              this.filterMap[status][filter.data1].push(filter);
            });
    
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
   * @return an array of filtered results with { "type" , "path" } or false if no filter present
   */
   process(midiMessage) {
     
     let filterList = null;
     
     if (this.lastFilter != null && this.lastFilter.length > 0
            && (this.lastFilter[0].accepts(midiMessage))) {
        filterList = this.lastFilter;
      } else
        this.lastFilter = null;
            
     if (filterList == null) {
       if (undefined === this.filterMap[midiMessage[0]])
        return false;
       if (undefined === this.filterMap[midiMessage[0]][midiMessage[1]])
        return false;
     }     
     
     filterList = this.filterMap[midiMessage[0]][midiMessage[1]];
     
     let filter = null;
     let outcome = null;
     let result = [];
     
     for (let i = 0; i < filterList.length; i++) {
         filter = this.filterMap[midiMessage[0]][midiMessage[1]][i];
         if (filter.accepts(midiMessage)){
           console.log("Accepted with filter " + filter.type);
           this.lastFilter = filterList;
           result.push(filter.process(midiMessage));
         }
     }
     
     return (!result.length) ? false : result;
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
        status = (key >> 4);
        channel = (key & 0xf);
        type = (status == 11) ? "CC" : "note";
        
        
        
        for (let subKey in this.filterMap[key]) {
          nKey =`CH${channel}${type}${subKey}`;  
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
    * match with preserve
    * @return new object. Note that any actual filter is referenced and not cloned
    * into the new object.
    */
    static merge(source, additional, preserve) {
      if (preserve === undefined)
        preserve = false;
      
      //deep clone of source
      let newFilterMap = new exports.FilterMap(null, source.disableShell);
      
      for (let sb in additional) {
        
        if (source[sb] !== undefined) {
          newFilterMap[sb] = {};
          
          for (let d1 in additional[sb]) {
            newFilterMap[sb][d1] = (source[sb][d1] !== undefined && preserve)
                ? newFilterMap[sb][d1].concat(additional[sb][d1])
                : additional[sb][d1];
          }
          
        } else
          newFilterMap[sb] = additional[sb];
      }
      
      return newFilterMap;
    }
}
