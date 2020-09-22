function processSoftPull(options) {
    let { dataintegration, segment, api_response, responseTraversalPath, } = options;
  
    responseTraversalPath = responseTraversalPath.reduce((acc, curr) => {
      acc[ curr.api_name ] = curr.traversalPath;
      return acc;
    }, {});
  
    return dataintegration.outputs.reduce((acc, curr) => {
      let { api_name, output_variable, } = curr;
      let value = api_response[responseTraversalPath[api_name]];
  
      try {
        let flat_api_response = flat(api_response, { maxDepth: 4 })
  
        switch (api_name) {
          case 'total_number_of_bankruptcies':
            let data = flat_api_response[responseTraversalPath[ api_name ]]
            return value = data.length;
          case 'total_number_of_collections':
            return value = flat_api_response[responseTraversalPath[ api_name ]].length
          // case 'months_of_credit_history':
          //   return value = flat_api_response[responseTraversalPath[ api_name ]];
          // case 'total_credit_inquiries_in_last_12_months': 
          //   return value = flat_api_response[responseTraversalPath[ api_name ]].length;
          // case 'number_of_revolving_accounts': 
          //   return value = flat_api_response[responseTraversalPath[ api_name ]].length;
          // case 'balance_of_revolving_accounts': 
          //   return value = flat_api_response[responseTraversalPath[ api_name ]].length;
          default:
            return value = flat_api_response[responseTraversalPath[ api_name ]];
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
    processSoftPull
}