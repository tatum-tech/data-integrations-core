const flat = require('flat');
const unflatten = require('flat').unflatten;
const helpers = require('../helpers');
const moment = require('moment');

function coerceValue(options) {
  let { data_type, value } = options;
  try {
    switch (data_type) {
    case 'String':
      return (typeof value === 'string') ? value : String(value);
    case 'Number': 
      return (value && !isNaN(Number(value))) ? Number(value) : value;
    case 'Boolean':
      if (typeof value === 'string' && value.toLowerCase() === 'true') {
        value = true;
      } else if (typeof value === 'string' && value.toLowerCase() === 'false') {
        value = false;
      }
      return value;  
    case 'Date':
      return (value && moment(value).format('MM/DD/YYYY') !== 'Invalid date') ? moment(value).format('MM/DD/YYYY') : value;
    default:
      return value;  
    }
  } catch (e) {
    return value;
  }
}

function processExperianCreditReport(options) {
    let { dataintegration, segment, api_response, responseTraversalPath, } = options;
  
    responseTraversalPath = responseTraversalPath.reduce((acc, curr) => {
      acc[ curr.api_name ] = curr.traversalPath;
      return acc;
    }, {});

    let flat_api_response = flat(api_response, { maxDepth: 5 })
  
    return dataintegration.outputs.reduce((acc, curr) => {
      let { api_name, output_variable, isArray } = curr;
      let value = api_response[responseTraversalPath[api_name]];
  
      try {
        if (flat_api_response[responseTraversalPath[ api_name ]].length > 0) {
          let data = flat_api_response[responseTraversalPath[ api_name ]].find(attributes => attributes.id == api_name )
          value = data.value;
        } else {
          flat_api_response = flat(api_response)
          value = flat_api_response[responseTraversalPath[ api_name ]];
        }
        
        let variable = output_variable.title;
        
        if (variable) acc[ variable ] = (value !== null && value !== undefined) ? coerceValue({ data_type: curr.data_type, value, }) : null;
        return acc;
      } catch (err) {
        return acc;
      }
    }, {});
}

module.exports = {
  processExperianCreditReport
}