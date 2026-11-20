// Gate 30: metadata-only plan. Never selects live credentials or creates an app.
// Firebase Preview and Production must use different projects AND databases.
// No environment here may activate deliveries or real payments.
export type EnvironmentName = "isolated_test"|"staging"|"production";
export type FirebaseLocation={projectId:string;databaseId:string};
export function validateFirebaseSeparation(locations:{
  isolated_test:FirebaseLocation;staging:FirebaseLocation;production:FirebaseLocation;
}) {
  const names=["isolated_test","staging","production"] as const;
  const project=/^(?:demo-[a-z0-9][a-z0-9-]{4,50}|[a-z][a-z0-9-]{5,50})$/;
  const database=/^(?:\(default\)|[a-z][a-z0-9-]{3,60})$/;
  for(const name of names){
    const l=locations?.[name];
    if(!l||typeof l.projectId!=="string"||!project.test(l.projectId)||
       typeof l.databaseId!=="string"||!database.test(l.databaseId))
      throw Error("firebase_location_invalid");
  }
  // Staging must have a distinct PROJECT, not just a separate collection.
  if(locations.staging.projectId===locations.production.projectId ||
     locations.isolated_test.projectId===locations.production.projectId ||
     locations.isolated_test.projectId===locations.staging.projectId)
    throw Error("firebase_projects_not_isolated");
  if(!locations.isolated_test.projectId.startsWith("demo-"))
    throw Error("firebase_lab_must_be_demo_project");
  return Object.freeze({
    isolated_test:Object.freeze({...locations.isolated_test}),
    staging:Object.freeze({...locations.staging}),
    production:Object.freeze({...locations.production}),
    paymentsEnabled:false as const,deliveriesEnabled:false as const,
    deployed:false as const,
  });
}
// Does not use old shared Preview Firebase credentials as a staging fallback.
// Future private deployment must provide all three identifiers separately.
export function stagingReadinessFromEnv(env:NodeJS.ProcessEnv) {
  const fields=["NC_FIREBASE_LAB_PROJECT_ID","NC_FIREBASE_LAB_DATABASE_ID",
    "NC_FIREBASE_STAGING_PROJECT_ID","NC_FIREBASE_STAGING_DATABASE_ID",
    "NC_FIREBASE_PRODUCTION_PROJECT_ID","NC_FIREBASE_PRODUCTION_DATABASE_ID"];
  if(fields.some(field=>typeof env[field]!=="string"||!env[field]))
    return {ready:false as const,code:"separate_firebase_projects_not_configured" as const};
  try{
    const plan=validateFirebaseSeparation({
      isolated_test:{projectId:env.NC_FIREBASE_LAB_PROJECT_ID!,
        databaseId:env.NC_FIREBASE_LAB_DATABASE_ID!},
      staging:{projectId:env.NC_FIREBASE_STAGING_PROJECT_ID!,
        databaseId:env.NC_FIREBASE_STAGING_DATABASE_ID!},
      production:{projectId:env.NC_FIREBASE_PRODUCTION_PROJECT_ID!,
        databaseId:env.NC_FIREBASE_PRODUCTION_DATABASE_ID!},
    });
    return {ready:true as const,plan};
  }catch{
    return {ready:false as const,code:"separate_firebase_projects_invalid" as const};
  }
}
