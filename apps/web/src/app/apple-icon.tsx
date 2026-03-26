import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(135deg, #0B1730 0%, #08111F 100%)",
          borderRadius: 36,
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%"
        }}
      >
        <svg fill="none" height="132" viewBox="0 0 1024 1024" width="132" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="apple-topBar" x1="302" y1="335" x2="612" y2="335" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#1D7BFF" />
              <stop offset="1" stopColor="#22D3EE" />
            </linearGradient>
            <linearGradient id="apple-tStem" x1="412" y1="373" x2="327" y2="610" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#1F4AE0" />
              <stop offset="1" stopColor="#0B84FF" />
            </linearGradient>
            <linearGradient id="apple-arrow" x1="415" y1="605" x2="790" y2="323" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#0891B2" />
              <stop offset="0.58" stopColor="#22C55E" />
              <stop offset="1" stopColor="#A3E635" />
            </linearGradient>
            <linearGradient id="apple-tail" x1="408" y1="612" x2="561" y2="469" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#1D4ED8" />
              <stop offset="1" stopColor="#22D3EE" />
            </linearGradient>
          </defs>
          <path d="M304 311H610L578 373H304V311Z" fill="url(#apple-topBar)" />
          <path d="M408 373H492L396 640C387 666 350 682 329 664C312 649 309 623 320 603L408 373Z" fill="url(#apple-tStem)" />
          <path d="M414 606L545 494L520 633L736 402L664 385L778 316L754 425L694 383L538 559C510 591 473 621 433 640L414 606Z" fill="url(#apple-tail)" />
          <path d="M520 633L731 400C767 361 813 336 863 327L814 379L889 409L835 521L807 455L592 672C565 699 533 719 498 730C474 737 449 719 443 694C437 671 472 653 520 633Z" fill="url(#apple-arrow)" />
        </svg>
      </div>
    ),
    size
  );
}
