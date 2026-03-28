import { auth } from "@/auth";

export default auth((req) => {
  if (!req.auth) {
    const u = new URL("/sign-in", req.url);
    u.searchParams.set("callbackUrl", req.url);
    return Response.redirect(u);
  }
  return undefined;
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/scanner/:path*",
    "/earnings/:path*",
    "/options/:path*",
    "/portfolio/:path*",
    "/positions/:path*",
    "/history/:path*",
    "/rationale/:path*",
    "/analytics/:path*",
    "/settings/:path*",
    "/notifications/:path*",
    "/strategy/:path*",
    "/watchlist/:path*",
  ],
};
