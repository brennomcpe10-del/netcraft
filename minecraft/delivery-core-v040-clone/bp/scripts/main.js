// Clone-only package entrypoint. All delivery, polling and VIP grants OFF.
// This does not import core_delivery_engine.js or initialize a bridge.
import {system} from '@minecraft/server';
system.run(()=>console.warn('[NETCRAFT_DELIVERY_V040] CLONE_PACKAGE_OFF_NO_GRANTS'));
