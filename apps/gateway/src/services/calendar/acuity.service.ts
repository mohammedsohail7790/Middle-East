/**
 * Acuity Scheduling integration — skeleton stub.
 * No external calendar sync in the skeleton; getConnection() always resolves
 * null so callers fall through to internal-only appointment booking.
 */

export const acuityService = {
  async getConnection(_tenantId: string): Promise<Record<string, unknown> | null> {
    return null;
  },

  async getAppointmentTypes(_tenantId: string): Promise<Array<{ id: string; name: string }>> {
    return [];
  },

  async createAppointment(
    _tenantId: string,
    _typeId: string,
    _startIso: string,
    _name: string,
    _email: string,
    _phone: string
  ): Promise<{ id: string } | null> {
    return null;
  },

  async cancelAppointment(_tenantId: string, _appointmentId: string): Promise<boolean> {
    return false;
  },
};
