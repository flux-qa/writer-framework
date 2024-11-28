import { test, expect } from "@playwright/test";

test.describe("Workflows", () => {
	let url: string;

	test.beforeAll(async ({ request }) => {
		const response = await request.post(`/preset/workflows`);
		expect(response.ok()).toBeTruthy();
		({ url } = await response.json());
	});

	test.afterAll(async ({ request }) => {
		await request.delete(url);
	});

	test.beforeEach(async ({ page }) => {
		await page.goto(url);
	});

	const inputData = [
		{ object: "plant", color: "green" },
		{ object: "cup", color: "pink" },
	];

	inputData.forEach(({ object, color }) => {
		test(`Test context and payload in Workflows for ${object} ${color}`, async ({
			page,
		}) => {
			await page.getByPlaceholder(object).fill(color);
			await page.locator(`[data-automation-action="toggle-log-panel"]`).click();
			const rowLocator = page
				.locator(".BuilderLogPanel div.row")
				.filter({ hasText: "Return value" });
			await rowLocator.getByRole("button", { name: "Details" }).click();
			const resultsLocator = page.locator(
				`.BuilderModal [data-automation-key="result"]`,
			);
			const returnValueLocator = page.locator(
				`.BuilderModal [data-automation-key="return-value"]`,
			);
			const expectedTexts = ["color", color, "object", object];
			expectedTexts.forEach(
				async (text) => await expect(resultsLocator).toContainText(text),
			);
			expectedTexts.forEach(
				async (text) => await expect(returnValueLocator).toContainText(text),
			);
		});
	});

	test("Create workflow and run workflow handle_object from it", async ({
		page,
	}) => {
		await page.locator(`[data-automation-action="set-mode-workflows"]`).click();
		await page.locator(`[data-automation-action="add-workflow"]`).click();

		await page
			.locator(
				`div.component.button[data-component-type="workflows_runworkflow"]`,
			)
			.dragTo(page.locator(".WorkflowsWorkflow"), {
				targetPosition: { x: 100, y: 100 },
			});
		const runWorkflowBlock = page.locator(`.WorkflowsNode.wf-type-workflows_runworkflow`);

		await page
			.locator(
				`div.component.button[data-component-type="workflows_returnvalue"]`,
			)
			.dragTo(page.locator(".WorkflowsWorkflow"), {
				targetPosition: { x: 400, y: 100 },
			});
		const returnValueBlock = page.locator(`.WorkflowsNode.wf-type-workflows_returnvalue`);

		await runWorkflowBlock.click();
		await page.locator(`.BuilderFieldsText[data-automation-key="workflowKey"] input`).fill("handle_object");
		const executionEnv = {
			"payload": "blue",
			"context": {
				"item": {
					"object": "bottle"
				}
			}
		};
		await page.locator(`.BuilderFieldsObject[data-automation-key="executionEnv"] textarea`).fill(JSON.stringify(executionEnv));
		await page.locator(`[data-automation-action="close-settings"]`).click();

		await runWorkflowBlock.locator(".ball.success").dragTo(returnValueBlock);

		await returnValueBlock.click();
		await page.locator(`.BuilderFieldsText[data-automation-key="value"] textarea`).fill("@{result}");

		await page.locator(`[data-automation-action="run-workflow"]`).click();

		await page.locator(`[data-automation-action="toggle-log-panel"]`).click();
		const rowLocator = page
			.locator(".BuilderLogPanel div.row")
			.filter({ hasText: "Return value" }).first();;
		await rowLocator.getByRole("button", { name: "Details" }).click();
		const returnValueLocator = page.locator(
			`.BuilderModal [data-automation-key="return-value"]`,
		);
		const expectedTexts = ["color", "blue", "object", "bottle"];
		expectedTexts.forEach(
			async (text) => await expect(returnValueLocator).toContainText(text),
		);
	});
});