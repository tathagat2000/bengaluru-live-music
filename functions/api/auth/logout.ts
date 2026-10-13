import { clearCookie,json,safeOrigin,type Context } from '../../_lib/core';
export async function onRequestPost({request}:Context){if(!safeOrigin(request))return json({error:'Bad origin'},403);return json({authenticated:false},200,{'Set-Cookie':clearCookie()})}
