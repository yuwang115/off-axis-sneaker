import { expect, test } from '@playwright/test';

test('renders the glass overlay, reacts to pointer movement, and preserves UI clicks', async ({
  page,
}) => {
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());

  await page.goto('/');

  const overlay = page.getByTestId('force-field-overlay');
  await expect(overlay).toHaveAttribute('data-force-field-ready', 'true');

  const particleCount = Number(
    (await overlay.getAttribute('data-force-field-particle-count')) ?? '0',
  );
  expect(particleCount).toBeGreaterThan(20);

  await page.mouse.move(640, 360);

  await expect
    .poll(async () =>
      Number((await overlay.getAttribute('data-force-field-displacement')) ?? '0'),
    )
    .toBeGreaterThan(1);

  await page.getByRole('button', { name: 'Open shoe controls' }).click();
  await expect(page.getByText(/position x:/i)).toBeVisible();
});
