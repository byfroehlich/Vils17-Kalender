import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Cleaner darf nur /my-jobs sehen
    if (token?.role === "CLEANER") {
      const allowed = ["/my-jobs"];
      const isAllowed = allowed.some((path) => pathname.startsWith(path));
      if (!isAllowed) {
        return NextResponse.redirect(new URL("/my-jobs", req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/calendar/:path*",
    "/bookings/:path*",
    "/cleaners/:path*",
    "/my-jobs/:path*",
  ],
};
