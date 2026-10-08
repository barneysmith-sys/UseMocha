type NodeResponse = {
  statusCode: number;
  setHeader: (key: string, value: string | number) => void;
  status: (code: number) => NodeResponse;
  json: (body: unknown) => void;
  send: (body: unknown) => void;
  end: (body?: unknown) => void;
  redirect: (code: number, location: string) => void;
};

type NodeRequest = {
  method: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
  url: string;
  socket: { remoteAddress: string };
};

type NodeHandler = (req: NodeRequest, res: NodeResponse) => Promise<void> | void;

function asBody(data: unknown): BodyInit | null {
  if (data == null) return null;
  if (typeof data === "string") return data;
  if (data instanceof Uint8Array) return new Blob([Buffer.from(data) as unknown as BlobPart]);
  return JSON.stringify(data);
}

export async function runNodeHandler(handler: NodeHandler, request: Request): Promise<Response> {
  const headers = Object.fromEntries(request.headers.entries());
  const url = new URL(request.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  let body: unknown = "";
  if (request.method !== "GET" && request.method !== "HEAD") {
    const raw = await request.text();
    if (raw && (headers["content-type"] || "").includes("application/json")) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    } else {
      body = raw;
    }
  }

  let status = 200;
  const outHeaders = new Headers();
  let payload: BodyInit | null = null;

  const res: NodeResponse = {
    statusCode: 200,
    setHeader(key, value) {
      outHeaders.set(key, String(value));
    },
    status(code) {
      status = code;
      this.statusCode = code;
      return this;
    },
    json(data) {
      if (!outHeaders.has("content-type")) outHeaders.set("content-type", "application/json; charset=utf-8");
      payload = JSON.stringify(data);
    },
    send(data) {
      if (!outHeaders.has("content-type") && typeof data === "string" && data.trim().startsWith("<")) {
        outHeaders.set("content-type", "text/html; charset=utf-8");
      }
      payload = asBody(data);
    },
    end(data) {
      if (data !== undefined) this.send(data);
    },
    redirect(code, location) {
      status = code;
      this.statusCode = code;
      outHeaders.set("location", location);
      payload = null;
    },
  };

  await handler(
    {
      method: request.method,
      headers,
      body,
      query,
      url: `${url.pathname}${url.search}`,
      socket: { remoteAddress: headers["x-forwarded-for"]?.split(",")[0]?.trim() || "" },
    },
    res,
  );

  return new Response(status === 204 ? null : payload, { status, headers: outHeaders });
}
