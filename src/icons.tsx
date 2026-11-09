const paths = {
  camera: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </>
  ),
  shuffle: <path d="M4 7h3.5c4 0 5 10 9 10H20m0 0-2.5-2.5M20 17l-2.5 2.5M4 17h3.5c1.4 0 2.4-1.2 3.2-2.7m2.6-4.6C14.1 8.2 15.1 7 16.5 7H20m0 0-2.5-2.5M20 7l-2.5 2.5" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6" />
    </>
  ),
  share: <path d="M12 15V4m0 0L8 8m4-4 4 4M6 11v7.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V11" />,
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6.5A1.5 1.5 0 0 0 14.5 5h-8A1.5 1.5 0 0 0 5 6.5v8A1.5 1.5 0 0 0 6.5 16H8" />
    </>
  ),
  trash: <path d="M5 7h14M10 7V5h4v2m-7 0 .8 11.2A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7" />,
  book: <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H18v14H6.5A1.5 1.5 0 0 0 5 19.5zm0 14A1.5 1.5 0 0 0 6.5 21H18v-3" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  photos: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="m4 16 4.5-4.5 4 4 2.5-2.5L20 18" />
      <circle cx="15.5" cy="9.5" r="1.5" />
    </>
  ),
  type: <path d="M5 7V5h14v2M12 5v14m-3 0h6" />,
  note: <path d="M5 19h4L19.5 8.5a2.1 2.1 0 0 0-3-3L6 16zM14.5 7.5l3 3" />,
  tag: (
    <>
      <path d="M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8z" />
      <circle cx="8.5" cy="8.5" r="1.3" />
    </>
  ),
  quote: <path d="M5 17.5c2.5-1 4-3 4-6V7H5v4.5h4M14 17.5c2.5-1 4-3 4-6V7h-4v4.5h4" />,
  retake: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <path d="M9 12.5a3 3 0 0 1 5.2-2l.8.8m0-2.3v2.3h-2.3M15 12.5a3 3 0 0 1-5.2 2l-.8-.8m0 2.3v-2.3h2.3" />
    </>
  ),
  page: <path d="M7 4h7l4 4v12H7zM14 4v4h4" />,
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  )
}
