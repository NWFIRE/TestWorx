# Page header styling

## Contrast follow-up

Header actions now have a light surface rather than inheriting the blue banner behind
transparent dark/blue-text controls. Existing destructive button and status badge colors
are retained. Scheduler uses the same surface; keyboard focus has a dark outline.
Two contrast regression tests verify standard text pairs at 4.5:1 or better and action
surface separation at 3:1 or better. Four Home navigation tests also passed.
Signed-in Timesheets checked at 1440x900 and 390x844; monthly inspection header checked
at 390x844. Computed action colors confirmed #334155 and the tenant's #2e68b1 on #f8fafc.
No live data was edited. These checks are not a full accessibility audit of every page
or every possible tenant-supplied brand color.

Page banners share `apps/web/src/app/app/page-banner.module.css`: the Home blue
gradient, white titles and pale-blue supporting text. The shared PageHeader covers
office list/detail/edit screens and its other existing consumers. Home composes the
same banner surface while retaining its sizing. Manuals now uses PageHeader rather
than its former larger, lighter title. Manual detail, Scheduler, Profile and field
request headers also share the profile. Navigation chrome, section titles and
specialized report editing toolbars are not page banners and remain unchanged.

Verification (November 23, 2026):
- Production build and web lint passed; nine Home navigation/schedule tests passed.
- Production deployment of abbec934 reached Ready; observed new styling on the live site.
- Signed-in office Manuals visually checked at 1440x900 and 390x844. Management link
  opened the existing page; management header checked at 800x720.
- Scheduler checked at 800x720 and 1440x900 with the existing date and view controls.
- Measured no page/main horizontal overflow on tested narrow Manuals and Scheduler views.
- No writes to business records during testing. Not every PageHeader consumer or a
  signed-in technician session was individually browser-tested.
