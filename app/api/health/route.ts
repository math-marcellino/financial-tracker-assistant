// Without this, a GET that reads no runtime data can be prerendered at build time, which
// would make this report the health of the build rather than of the running deployment.
export const dynamic = "force-dynamic";

export const GET = async (): Promise<Response> => Response.json({ status: "ok" });
