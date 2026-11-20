// Clone-only package entrypoint. All delivery, polling and VIP grants OFF.
// The executor library is never imported by this OFF entrypoint.
import {system} from '@minecraft/server';
system.run(()=>console.warn('[NETCRAFT_DELIVERY_V040] CLONE_PACKAGE_OFF_NO_GRANTS'));
