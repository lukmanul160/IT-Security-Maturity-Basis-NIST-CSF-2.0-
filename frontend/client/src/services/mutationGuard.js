const mutations = new Set(['POST','PUT','PATCH','DELETE']);
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}
export function createMutationGuard(transport, origin) {
  const pending = new Map(), files = new WeakMap(); let nextFile = 0;
  function bodyKey(body) {
    if (body == null) return '';
    if (typeof body === 'string') { try {return JSON.stringify(stable(JSON.parse(body)));} catch {return body;} }
    if (body instanceof FormData) return JSON.stringify([...body.entries()].map(([key,value])=> {
      if (typeof value === 'string') return [key,value];
      if (!files.has(value)) files.set(value,++nextFile);
      return [key,files.get(value),value.name,value.size,value.type,value.lastModified];
    }));
    if (body instanceof URLSearchParams) return body.toString();
    return null;
  }
  return (input, options={}) => {
    const method = String(options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = new URL(input instanceof Request ? input.url : String(input),origin);
    if (!mutations.has(method) || url.origin!==origin || !url.pathname.startsWith('/api/') || input instanceof Request) return transport(input,options);
    const body = bodyKey(options.body);
    if (body === null || options.signal?.aborted) return transport(input,options);
    const key = `${method} ${url.href} ${body}`;
    // Requests with their own cancellation lifecycle remain independent.
    if (options.signal) return transport(input,options);
    let operation=pending.get(key);
    if (!operation) {
      operation={consumers:0,promise:Promise.resolve().then(()=>transport(input,options)).finally(()=>pending.delete(key))};
      pending.set(key,operation);
    }
    const consumer=operation.consumers++;
    return operation.promise.then(response=>consumer===0?response:response.clone());
  };
}
export function installMutationGuard() {
  if (window.__mutationGuardInstalled) return;
  window.__mutationGuardInstalled=true;
  window.fetch=createMutationGuard(window.fetch.bind(window),window.location.origin);
}
