export class ApiError extends Error{constructor(public code:string,public status=400){super(code);}}
export function assertApi(value:unknown,code:string,status=400):asserts value{if(!value)throw new ApiError(code,status);}
