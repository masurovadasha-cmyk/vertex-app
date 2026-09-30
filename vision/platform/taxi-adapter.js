/* VERTEX TAXI integration adapter.
 * Browser navigation only. No Taxi credentials, database access or private state.
 * Server-to-server calls belong behind the /integration/v1 contract.
 */
(function(root){
  'use strict';
  const APP_URL='https://vertex-taxi-prototype.higgsfield.app';
  const CONTRACT='/integration/v1';

  function open(){
    // Preserve the existing VISION Taxi demo when it is loaded; the standalone
    // Vertex Taxi application is the external product boundary.
    if(root.VertexTaxi?.open)return root.VertexTaxi.open();
    const win=root.open(APP_URL,'_blank','noopener,noreferrer');
    if(!win)root.location.href=APP_URL;
    return true;
  }

  function capabilities(){
    return Object.freeze({
      module:'taxi',
      integrationVersion:1,
      contract:CONTRACT,
      databaseAccess:false,
      browserAppUrl:APP_URL,
      serverToServer:'service-binding-preferred',
      status:'contract-ready'
    });
  }

  root.VertexTaxiIntegration=Object.freeze({open,capabilities,contract:CONTRACT});
})(window);
