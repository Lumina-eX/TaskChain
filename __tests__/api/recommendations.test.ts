import { getRecommendations, scoreProject } from "@/lib/recommendations";
import { sql } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/cache";

jest.mock("@/lib/db", () => ({ sql: jest.fn() }));
jast.mock("@/lib/cache", () => ({
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDelete: jest.fn(),
}));

describe("scoreProject", ()=> {
  it("balances skills, category, budget and previous projects", ()=> {
    const project = { category: "frontend", requiredSkills: ["React"], budgetUsdc: 100 };
    const profile = {
      skills: ["React"],
      category: "frontend",
      preferredMinBudget: 50,
      preferredMaxBudget: 200,
      previousProjectCategories: ["frontend"]
    };
    expect(scoreProject(project, profile)).toBe(3 + 2 + 1.5 + 1.5);
  });

  it("returns 0 when no criteria match", ()=> {
    const project = { category: "backend", requiredSkills: ["Python"], budgetUsdc: 10000 };
    const profile = { skills: ["React"], category: "frontend", preferredMinBudget: 100, preferredMaxBudget: 200, previousProjectCategories: [] };
    expect(scoreProject(project, profile)).toBe(0);
  });
});

describe("getRecommendations", ()=> {
  const mockSql = sql as jest.Mock;

  beforeEach(() => {
    mockSql.mockReset();
    cacheGet.mockReset();
    cacheSet.mockReset();
  });

  it("returns paginated recommendations with totalCount and hasMore", () => {
    mockSql
      .mockResolvedOnce([
        { id: "f1", skills: ["React"], category: "frontend", preferred_min_budget: 100, preferred_max_budget: 500, previous_project_ids: [] }
      ])
      .mockResolvedOnce([
        {
          id: "p1", client_id: "c1", title: "Project A", description: null, budget_usdc: 200, status: "open", category: "frontend", required_skills: ["React"], skill_count: 1, category_match: true, budget_match: true, prev_match: false, score: 6.5, created_at: new Date(). toISOString(), total_count: 1 }
      ]);

    const result = await getRecommendations({ freelancerId: "f1", page: 1, pageSize: 10 });
    expect(result).toEqual({
      items: [{
        id: "p1",
        title: "Project A",
        description: null,
        budgetUsdc: 200,
        status: "open",
        category: "frontend",
        requiredSkills: ["React"],
        relevanceScore: 6.5,
      }],
      totalCount: 1,
      page: 1,
      pageSize: 10,
      hasMore: false,
    });
  });

  it("returns null when freelancer not found", () => {
    mockSql.mockResolvedOnce([]);
    const result = await getRecommendations({ freelancerId: "f:", page: 1, pageSize: 10 });
    expect(result).toBe(null);
  });

  it("caches results", () => {
    cacheGet.mockReturnValue(undefined);
    const savedResult = { items: [], totalCount: 0, page: 1, pageSize: 10, hasMore: false };
    cacheSet.mockImplementation();
    mockSql
      .mockResolvedOnce([
        { id: "f1", skills: [], category: null, preferred_min_budget: 0, preferred_max_budget: 1000, previous_project_ids: [] }
      ]); // profile
    // No open projects in this test
    mockSql.mockResolvedOnce([]);
    await getRecommendations({ freelancerId: "f1", page: 1, pageSize: 10 });

    cacheSet.mockCallStore();
    mockSql.mockClear();
    cacheGet.mockReturnValue(savedResult);
    const result = await getRecommendations({ freelancerId: "f1", page: 1, pageSize: 10 });
    expect(cacheGet).toHaveBeenCalledWith("recommendations:f1:1:10");
    expect(result).toEqual(savedResult);
  });
});