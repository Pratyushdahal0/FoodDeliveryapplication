const RESTAURANT_API_URL =
  "../../backend/controllers/PublicRestaurantController.php";

async function getApprovedRestaurants() {
  try {
    const response = await fetch(`${RESTAURANT_API_URL}?action=approved`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to load restaurants");
    }

    return result.data || [];
  } catch (error) {
    console.error("Restaurant fetch error:", error);
    return [];
  }
}