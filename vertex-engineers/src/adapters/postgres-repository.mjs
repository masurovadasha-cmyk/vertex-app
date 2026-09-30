function requireScope(scope){
 if(!scope?.tenant_id||!scope?.organization_id)throw new Error("scope is required");
 return [scope.tenant_id,scope.organization_id];
}
export function createPostgresRepository(db){
 if(!db?.query)throw new Error("PostgreSQL query adapter is required");
 return {
  projects:{
   async get(id,scope){const [t,o]=requireScope(scope);return (await db.query("select * from engineers_projects where tenant_id=$1 and organization_id=$2 and id=$3",[t,o,id])).rows[0]||null;},
   async list(scope){const [t,o]=requireScope(scope);return (await db.query("select * from engineers_projects where tenant_id=$1 and organization_id=$2 order by created_at",[t,o])).rows;},
   async put(v){return (await db.query("insert into engineers_projects(tenant_id,organization_id,id,client_id,name,type,site_address,status,stage,budget,currency,start_date,target_date,manager_user_id,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) on conflict(tenant_id,organization_id,id) do update set client_id=excluded.client_id,name=excluded.name,type=excluded.type,site_address=excluded.site_address,status=excluded.status,stage=excluded.stage,budget=excluded.budget,currency=excluded.currency,start_date=excluded.start_date,target_date=excluded.target_date,manager_user_id=excluded.manager_user_id,updated_at=excluded.updated_at returning *",[v.tenant_id,v.organization_id,v.id,v.client_id,v.name,v.type,v.site_address,v.status,v.stage,v.budget,v.currency,v.start_date,v.target_date,v.manager_user_id,v.created_at,v.updated_at])).rows[0];}
  },
  assets:{
   async get(id,scope){const [t,o]=requireScope(scope);return (await db.query("select * from engineers_assets where tenant_id=$1 and organization_id=$2 and id=$3",[t,o,id])).rows[0]||null;},
   async list(scope){const [t,o]=requireScope(scope);return (await db.query("select * from engineers_assets where tenant_id=$1 and organization_id=$2 order by created_at",[t,o])).rows;},
   async put(v){
    const row=(await db.query("insert into engineers_assets(tenant_id,organization_id,id,project_id,category,manufacturer,model,serial_number,site_location,commissioned_at,warranty_until,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(tenant_id,organization_id,id) do update set project_id=excluded.project_id,category=excluded.category,manufacturer=excluded.manufacturer,model=excluded.model,serial_number=excluded.serial_number,site_location=excluded.site_location,commissioned_at=excluded.commissioned_at,warranty_until=excluded.warranty_until,status=excluded.status,updated_at=now() returning *",[v.tenant_id,v.organization_id,v.id,v.project_id,v.category,v.manufacturer,v.model,v.serial_number,v.site_location,v.commissioned_at,v.warranty_until,v.status])).rows[0];
    if(v.category==="elevator")await db.query("insert into engineers_elevator_assets(tenant_id,organization_id,asset_id,capacity_kg,speed_mps,stops,travel_m,drive_type,machine_room_type,safe_lift_registration_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(tenant_id,organization_id,asset_id) do update set capacity_kg=excluded.capacity_kg,speed_mps=excluded.speed_mps,stops=excluded.stops,travel_m=excluded.travel_m,drive_type=excluded.drive_type,machine_room_type=excluded.machine_room_type,safe_lift_registration_id=excluded.safe_lift_registration_id",[v.tenant_id,v.organization_id,v.id,v.capacity_kg,v.speed_mps,v.stops,v.travel_m,v.drive_type,v.machine_room_type,v.safe_lift_registration_id]);
    else await db.query("insert into engineers_hvac_assets(tenant_id,organization_id,asset_id,system_type,cooling_capacity_kw,heating_capacity_kw,airflow_m3h,refrigerant,zone) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(tenant_id,organization_id,asset_id) do update set system_type=excluded.system_type,cooling_capacity_kw=excluded.cooling_capacity_kw,heating_capacity_kw=excluded.heating_capacity_kw,airflow_m3h=excluded.airflow_m3h,refrigerant=excluded.refrigerant,zone=excluded.zone",[v.tenant_id,v.organization_id,v.id,v.system_type,v.cooling_capacity_kw,v.heating_capacity_kw,v.airflow_m3h,v.refrigerant,v.zone]);
    return {...row,...v};
   }
  },
  workOrders:{
   async get(id,scope){const [t,o]=requireScope(scope);const row=(await db.query("select * from engineers_work_orders where tenant_id=$1 and organization_id=$2 and id=$3",[t,o,id])).rows[0];if(!row)return null;row.technician_ids=(await db.query("select technician_id from engineers_work_order_technicians where tenant_id=$1 and organization_id=$2 and work_order_id=$3",[t,o,id])).rows.map(x=>x.technician_id);return row;},
   async list(scope){const [t,o]=requireScope(scope);return (await db.query("select * from engineers_work_orders where tenant_id=$1 and organization_id=$2 order by created_at",[t,o])).rows;},
   async put(v){
    const row=(await db.query("insert into engineers_work_orders(tenant_id,organization_id,id,asset_id,type,priority,status,requested_at,assigned_team_id,scheduled_at,started_at,completed_at,resolution_summary) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict(tenant_id,organization_id,id) do update set type=excluded.type,priority=excluded.priority,status=excluded.status,assigned_team_id=excluded.assigned_team_id,scheduled_at=excluded.scheduled_at,started_at=excluded.started_at,completed_at=excluded.completed_at,resolution_summary=excluded.resolution_summary,updated_at=now() returning *",[v.tenant_id,v.organization_id,v.id,v.asset_id,v.type,v.priority,v.status,v.requested_at,v.assigned_team_id,v.scheduled_at,v.started_at,v.completed_at,v.resolution_summary])).rows[0];
    await db.query("delete from engineers_work_order_technicians where tenant_id=$1 and organization_id=$2 and work_order_id=$3",[v.tenant_id,v.organization_id,v.id]);
    for(const id of v.technician_ids||[])await db.query("insert into engineers_work_order_technicians(tenant_id,organization_id,work_order_id,technician_id) values($1,$2,$3,$4)",[v.tenant_id,v.organization_id,v.id,id]);
    return {...row,technician_ids:[...(v.technician_ids||[])]};
   }
  }
 };
}
