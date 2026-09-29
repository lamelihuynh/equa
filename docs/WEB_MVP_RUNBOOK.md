# Web MVP manual verification

This remains a repeatable run procedure. Phase 10 also ran the real API mode in headless
Chrome through Kong against the local Identity/Social/Ledger/PostgreSQL stack.

## Start

1. Start local PostgreSQL and run Identity, Social, and Ledger migrations.
2. Start those services, Kong, then Web. Set `NEXT_PUBLIC_API_BASE_URL` to the local
   Kong `/v1` URL (default `http://localhost:8000/v1`).
3. Use a verified Identity account; the Social and Ledger adapters must be configured
   with their service URLs and keys.

## Flow

1. Sign in through `/`, open the profile, and verify changes persist after reload.
2. On `/friends`, send a request to an existing email/username. Sign in as the target
   account, accept it, then verify both sessions show `FRIEND`. Remove it only when
   Ledger reports no outstanding debt.
3. On `/groups`, create a group and verify its creator is `ADMIN`. Invite by email or
   link; share the returned invitation code with the recipient. The recipient enters
   the code on `/groups` to accept. Verify the member list, edit group details, and
   remove a member only after outstanding group debt is resolved.
4. On `/expenses`, select a group or friend, choose payer and participants, enter each
   participant's explicit share, and create the expense. Ledger requires shares to sum
   to the integer minor-unit amount. Client mutation keys are reused for an identical
   pending create/edit/delete after an ambiguous network response. Edit once, reload, then soft-delete and verify it
   leaves the active list and total.
5. Return to `/dashboard`; verify active group count, recent server expenses, and
   currency-separated totals. Retry after changing data and after an access-token
   refresh.
6. From `/`, choose **Mở Local Demo** to verify the separate browser-only demo. Confirm
   its `Local Demo · browser storage` label remains visible and its data does not appear
   in API mode.

## Current limitations

- The Web displays Social user IDs because current public friend/group-member contracts
  do not provide display names. It does not call Identity's internal resolver.
- Admin group dissolution is available in API mode. Dissolving a group currently makes
  its linked Ledger expenses unreadable under membership authorization; post-dissolution
  history visibility remains unspecified.
- Friend pair balances are displayed. Group balance, settlement, and named split modes
  are not implemented by this Web flow. Notification provider delivery is disabled.
- `Local Demo` is browser persistence and never represents server data.

## Phase 10 browser evidence

Headless Chrome used the verified local API account through the normal Web login, then
opened friends, groups, expenses, dashboard, and profile. The browser created, edited,
and soft-deleted an expense; verified group creation with an image URL, image/type editing,
and admin dissolution; and displayed the live friend balance. Browser page errors: 0.
The run used synthetic `example.com` test identities and no credentials or tokens are
recorded here. Native Expo/device validation remains separate and was not run.
