export interface D1Result<T=unknown>{success:boolean;results:T[]}
export interface D1PreparedStatement{
  bind(...values:Array<string|number|null>):D1PreparedStatement;
  all<T=unknown>():Promise<D1Result<T>>;
  run():Promise<D1Result>;
}
export interface D1Database{
  prepare(query:string):D1PreparedStatement;
  batch(statements:D1PreparedStatement[]):Promise<D1Result[]>;
}
