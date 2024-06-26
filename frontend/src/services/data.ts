class DataService {
  private url: string = "http://localhost:5000";

  async fetchData(
    endpoint: string,
    method: string,
    options: RequestInit = {},
    token?: string,
  ) {
    if (token) {
      options.headers = {
        ...options.headers,
        "Authorization": `Bearer ${token}`,
      };
    }

    try {
      const response = await fetch(this.url + endpoint, { ...options, method });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error ocurred during fetch data:", error);
      throw error;
    }
  }
}

export default new DataService();
