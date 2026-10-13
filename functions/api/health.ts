import {configured,json,type Context} from '../_lib/core';
export async function onRequestGet({env}:Context){return json({status:'ok',configured:configured(env),timestamp:new Date().toISOString()})}
