# Page header styling

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
