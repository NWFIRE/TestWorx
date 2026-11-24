# Workspace shell

The shared desktop top bar is removed for all workspace roles and routes. Pages
retain their own headers; the sidebar remains the primary desktop navigation.
Browser history and reload remain available without duplicate shell buttons.

Office and customer layouts retain a Menu button inside the content area on
narrow screens. Technician mobile navigation, sync controls, and pull-to-refresh
remain unchanged. The Scheduler remains standalone without sidebar or top bar.

`e2e/app-shell-layout.spec.ts` verifies the shared shell across desktop roles,
list/detail/settings routes, narrow navigation, and Scheduler resizing using
isolated authentication and native-integration boundaries.
