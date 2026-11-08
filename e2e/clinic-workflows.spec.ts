import { test, expect } from "@playwright/test";

test("patient registration, booking, kiosk, staff addition and appointment cancellation persist through real UI/API paths", async ({
  page,
  context,
}) => {
  // Fictional data in the runner's isolated development database. No route mocks.
  const signIn = await context.request.post("/api/clinic/session", {
    data: {
      email: "workflow@example.invalid",
      password: "development-workflow",
      method: "email",
    },
  });
  expect(signIn.status()).toBe(200);
  await context.addInitScript(() => {
    if (location.origin === "http://127.0.0.1:3102")
      sessionStorage.setItem(
        "clinic_auth_session",
        JSON.stringify({
          authenticated: true,
          role: "admin",
          method: "email",
          verificationCompleted: true,
          permissions: ["audit-log:read"],
        }),
      );
  });
  await page.goto("/portal");
  await page
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Patient Management", exact: true })
    .click();
  await page.getByLabel("First name", { exact: true }).fill("Development");
  await page.getByLabel("Last name", { exact: true }).fill("Verification");
  await page.getByLabel("Phone number", { exact: true }).fill("4085550198");
  const registered = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/admin/patients") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Register patient", exact: true })
    .click();
  expect((await registered).status()).toBe(201);
  await expect(page.getByRole("status")).toContainText(
    "Patient record saved and audited.",
  );
  await expect(
    page.getByText("Development Verification", { exact: true }),
  ).toBeVisible();

  await page.goto("/");
  await page
    .getByRole("button", { name: "Book a visit", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByLabel("Full name *", { exact: true })
    .fill("Development Verification");
  await page.getByLabel("Phone number *", { exact: true }).fill("4085550198");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await page.getByLabel("Appointment date *", { exact: true }).fill(today);
  await page
    .getByLabel("Practitioner *", { exact: true })
    .selectOption({ label: "Dr. Li" });
  await page
    .getByLabel("Appointment time *", { exact: true })
    .selectOption("9:00 AM");
  const booked = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/appointments") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Confirm appointment", exact: true })
    .click();
  const receipt = await booked;
  expect(receipt.status()).toBe(201);
  const { appointment } = await receipt.json();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Your appointment has been saved." }),
  ).toBeVisible();

  await page.goto("/kiosk");
  await page
    .getByRole("button", { name: /Enter last four phone digits/ })
    .click();
  await page.getByLabel("Last four digits").fill("0198");
  await page
    .getByRole("button", { name: "Find my appointment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Please confirm your check-in",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Development Verification", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm Check-In", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check-in successful", exact: true }),
  ).toBeVisible();
  const stored = await context.request.get("/api/admin/appointments");
  expect(stored.status()).toBe(200);
  const records = await stored.json();
  expect(
    records.appointments.find(
      (item: { id: string }) => item.id === appointment.id,
    ).checkedInAt,
  ).toBeTruthy();

  await page.goto("/portal");
  await page.getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Staff Management", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Development Staff Verification");
  await page.getByLabel("Role", { exact: true }).fill("Development directory entry");
  await page.getByLabel("Working hours", { exact: true }).fill("Test only");
  const addedStaff = page.waitForResponse((response) =>
    response.url().endsWith("/api/admin/staff") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  expect((await addedStaff).status()).toBe(201);
  await expect(page.getByRole("status")).toContainText("Staff record saved and audited.");
  await expect(page.getByText("Development Staff Verification", { exact: true })).toBeVisible();

  const cancelBooking = await context.request.post("/api/appointments", { data: {
    name: "Development Cancellation Check", contact: "4085550198", date: today,
    time: "9:30 AM", practitioner: "李医生",
  } });
  expect(cancelBooking.status()).toBe(201);
  const cancellationId = (await cancelBooking.json()).appointment.id;
  await page.getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("button", { name: "Appointment Management", exact: true }).click();
  const cancellationCard = page.getByRole("article").filter({ hasText: "Development Cancellation Check" });
  const canceled = page.waitForResponse((response) =>
    response.url().endsWith("/api/admin/appointments") && response.request().method() === "DELETE");
  await cancellationCard.getByRole("button", { name: "Cancel appointment", exact: true }).click();
  expect((await canceled).status()).toBe(200);
  await expect(cancellationCard).toContainText("Canceled");
  await expect(page.getByRole("status")).toContainText("Appointment canceled and audited.");
  const afterCancellation = await (await context.request.get("/api/admin/appointments")).json();
  expect(afterCancellation.appointments.find((item: { id: string }) => item.id === cancellationId).status).toBe("cancelled");
  const slots = await (await context.request.get(`/api/appointments?${new URLSearchParams({ date: today, practitioner: "李医生" })}`)).json();
  expect(slots.unavailableTimes).not.toContain("9:30 AM");
  const response = await context.request.get("/api/system-status");
  expect(response.status()).toBe(200);
  const status = await response.json();
  for (const name of [
    "Patient management -> durable records and audit",
    "Public booking -> appointment state",
    "Kiosk -> patient list and appointment state",
    "Staff management -> durable records and audit",
    "Appointment changes -> shared storage and audit",
  ]) {
    expect(
      status.items.find((item: { name: string }) => item.name === name).status,
    ).toBe("Connected");
  }
});
