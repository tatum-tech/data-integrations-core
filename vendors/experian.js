const flat = require('flat');
const unflatten = require('flat').unflatten;

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