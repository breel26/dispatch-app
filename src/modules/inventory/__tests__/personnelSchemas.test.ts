import { describe, it, expect } from "vitest";
import { createPersonnelSchema, updatePersonnelSchema } from "../schemas";
import { CRAFT_VALUES, CLASSIFICATION_VALUES } from "../craft";

const VALID = {
  employeeId: "000001",
  firstName: "dave",
  lastName: "eguiza",
  dateOfBirth: "1990-05-15",
  hireDate: "2020-01-01",
  ssn: "123-45-6789",
  driversLicenseNumber: "D1234567",
  homeStreet1: "123 Main St",
  homeCity: "Springfield",
  homeState: "CA",
  homePostalCode: "90001",
  phoneNumber: "(555) 123-4567",
  craft: "CARPENTER",
  classification: "JOURNEYMAN",
  certifications: ["OSHA-30"],
  isActive: true,
};

describe("createPersonnelSchema", () => {
  it("accepts a complete worker", () => {
    const result = createPersonnelSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  // Foreman and Superintendent were added to the enum alongside the
  // original pair - this loop exercises all four automatically because it
  // iterates CLASSIFICATION_VALUES rather than naming values by hand.
  it("accepts every craft and classification the dropdown offers", () => {
    for (const craft of CRAFT_VALUES) {
      for (const classification of CLASSIFICATION_VALUES) {
        const result = createPersonnelSchema.safeParse({ ...VALID, craft, classification });
        expect(result.success).toBe(true);
      }
    }
  });

  // Both fields are required: replacing the old free-text role field was
  // the point, so a worker without a trade must not be creatable.
  it("refuses a worker with no craft", () => {
    const result = createPersonnelSchema.safeParse({ ...VALID, craft: undefined });
    expect(result.success).toBe(false);
  });

  it("refuses a worker with no classification", () => {
    const result = createPersonnelSchema.safeParse({ ...VALID, classification: undefined });
    expect(result.success).toBe(false);
  });

  // The old role field accepted anything typed into it, which is how a
  // trade and a grade abbreviation ended up squeezed into one string.
  it("refuses a trade that is not on the list", () => {
    expect(createPersonnelSchema.safeParse({ ...VALID, craft: "WELDER" }).success).toBe(false);
    expect(createPersonnelSchema.safeParse({ ...VALID, craft: "JM Carpenter" }).success).toBe(
      false
    );
  });

  it("refuses the display label in place of the stored value", () => {
    // "Pipe Fitter" is what a person reads; PIPE_FITTER is what is stored.
    expect(createPersonnelSchema.safeParse({ ...VALID, craft: "Pipe Fitter" }).success).toBe(
      false
    );
  });

  it("explains what to do when a craft is missing", () => {
    const result = createPersonnelSchema.safeParse({ ...VALID, craft: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("select a craft");
    }
  });

  it("still defaults certifications to empty and isActive to true", () => {
    const {
      employeeId, firstName, lastName, dateOfBirth, hireDate, ssn, driversLicenseNumber,
      homeStreet1, homeCity, homeState, homePostalCode, phoneNumber, craft, classification,
    } = VALID;
    const result = createPersonnelSchema.parse({
      employeeId, firstName, lastName, dateOfBirth, hireDate, ssn, driversLicenseNumber,
      homeStreet1, homeCity, homeState, homePostalCode, phoneNumber, craft, classification,
    });
    expect(result.certifications).toEqual([]);
    expect(result.isActive).toBe(true);
  });

  it("defaults home country to US when not supplied", () => {
    const result = createPersonnelSchema.parse(VALID);
    expect(result.homeCountry).toBe("US");
  });

  // Normalization lives in the schema rather than at the call site, so no
  // write path can store "1" as a worker distinct from "000001".
  it("pads a short employee id to the stored form", () => {
    expect(createPersonnelSchema.parse({ ...VALID, employeeId: "7" }).employeeId).toBe("000007");
    expect(createPersonnelSchema.parse({ ...VALID, employeeId: " 42 " }).employeeId).toBe(
      "000042"
    );
  });

  it("refuses an employee id that is not a number", () => {
    expect(createPersonnelSchema.safeParse({ ...VALID, employeeId: "E1234" }).success).toBe(
      false
    );
    expect(createPersonnelSchema.safeParse({ ...VALID, employeeId: "" }).success).toBe(false);
    expect(createPersonnelSchema.safeParse({ ...VALID, employeeId: "000000" }).success).toBe(
      false
    );
  });

  it("refuses a worker with no employee id at all", () => {
    expect(createPersonnelSchema.safeParse({ ...VALID, employeeId: undefined }).success).toBe(
      false
    );
  });

  describe("ssn", () => {
    it("requires the XXX-XX-XXXX format", () => {
      expect(createPersonnelSchema.safeParse({ ...VALID, ssn: "123-45-6789" }).success).toBe(
        true
      );
      expect(createPersonnelSchema.safeParse({ ...VALID, ssn: "123456789" }).success).toBe(
        false
      );
      expect(createPersonnelSchema.safeParse({ ...VALID, ssn: "123-456-789" }).success).toBe(
        false
      );
    });

    it("is required on create", () => {
      expect(createPersonnelSchema.safeParse({ ...VALID, ssn: undefined }).success).toBe(false);
    });
  });

  describe("driversLicenseNumber", () => {
    it("requires a non-empty value", () => {
      expect(
        createPersonnelSchema.safeParse({ ...VALID, driversLicenseNumber: "" }).success
      ).toBe(false);
      expect(createPersonnelSchema.safeParse({ ...VALID, driversLicenseNumber: undefined }).success).toBe(
        false
      );
    });
  });

  describe("phoneNumber", () => {
    it("requires the (XXX) XXX-XXXX format", () => {
      expect(
        createPersonnelSchema.safeParse({ ...VALID, phoneNumber: "(555) 123-4567" }).success
      ).toBe(true);
      expect(
        createPersonnelSchema.safeParse({ ...VALID, phoneNumber: "555-123-4567" }).success
      ).toBe(false);
      expect(createPersonnelSchema.safeParse({ ...VALID, phoneNumber: "5551234567" }).success).toBe(
        false
      );
    });
  });

  describe("home address", () => {
    it("requires street, city, state, and postal code", () => {
      expect(createPersonnelSchema.safeParse({ ...VALID, homeStreet1: "" }).success).toBe(false);
      expect(createPersonnelSchema.safeParse({ ...VALID, homeCity: "" }).success).toBe(false);
      expect(createPersonnelSchema.safeParse({ ...VALID, homeState: "" }).success).toBe(false);
      expect(createPersonnelSchema.safeParse({ ...VALID, homePostalCode: "" }).success).toBe(
        false
      );
    });

    it("leaves street line 2 optional", () => {
      const result = createPersonnelSchema.safeParse({ ...VALID, homeStreet2: undefined });
      expect(result.success).toBe(true);
    });

    it("requires state as exactly two letters", () => {
      expect(createPersonnelSchema.safeParse({ ...VALID, homeState: "California" }).success).toBe(
        false
      );
      expect(createPersonnelSchema.safeParse({ ...VALID, homeState: "C" }).success).toBe(false);
    });

    it("uppercases a lowercase state abbreviation", () => {
      const result = createPersonnelSchema.parse({ ...VALID, homeState: "ca" });
      expect(result.homeState).toBe("CA");
    });

    it("accepts a five digit or ZIP+4 postal code", () => {
      expect(createPersonnelSchema.safeParse({ ...VALID, homePostalCode: "90001" }).success).toBe(
        true
      );
      expect(
        createPersonnelSchema.safeParse({ ...VALID, homePostalCode: "90001-1234" }).success
      ).toBe(true);
      expect(createPersonnelSchema.safeParse({ ...VALID, homePostalCode: "ABCDE" }).success).toBe(
        false
      );
    });
  });

  describe("dates", () => {
    it("requires a real date of birth and hire date", () => {
      expect(createPersonnelSchema.safeParse({ ...VALID, dateOfBirth: undefined }).success).toBe(
        false
      );
      expect(createPersonnelSchema.safeParse({ ...VALID, hireDate: undefined }).success).toBe(
        false
      );
    });

    it("refuses an unparsable date rather than silently storing garbage", () => {
      expect(createPersonnelSchema.safeParse({ ...VALID, dateOfBirth: "not a date" }).success).toBe(
        false
      );
    });
  });
});

describe("updatePersonnelSchema", () => {
  it("allows a partial update that touches only one field", () => {
    const result = updatePersonnelSchema.safeParse({ firstName: "New" });
    expect(result.success).toBe(true);
  });

  it("allows promoting a worker without restating their craft", () => {
    const result = updatePersonnelSchema.safeParse({ classification: "FOREMAN" });
    expect(result.success).toBe(true);
  });

  // Optional must still mean "valid if present", not "unchecked".
  it("still rejects an invalid craft when one is supplied", () => {
    expect(updatePersonnelSchema.safeParse({ craft: "WELDER" }).success).toBe(false);
  });

  it("normalizes an employee id supplied on update, and rejects a bad one", () => {
    const result = updatePersonnelSchema.parse({ employeeId: "9" });
    expect(result.employeeId).toBe("000009");
    expect(updatePersonnelSchema.safeParse({ employeeId: "nope" }).success).toBe(false);
  });

  // The schema's job is just "valid if present" - the actual "blank means
  // leave unchanged" behavior lives at the Server Action layer, which maps
  // an empty form field to undefined before this ever runs. What the
  // schema needs to prove is that omitting ssn/driversLicenseNumber
  // entirely is valid, and that a value, when present, is still checked.
  describe("ssn and driversLicenseNumber", () => {
    it("are not required when omitted", () => {
      expect(updatePersonnelSchema.safeParse({ firstName: "New" }).success).toBe(true);
    });

    it("still validate format when supplied", () => {
      expect(updatePersonnelSchema.safeParse({ ssn: "not-an-ssn" }).success).toBe(false);
      expect(updatePersonnelSchema.safeParse({ ssn: "987-65-4321" }).success).toBe(true);
    });
  });
});
