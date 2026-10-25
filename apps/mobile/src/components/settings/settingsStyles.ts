import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 100,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 32,
  },
  card: {
    padding: 24,
    marginBottom: 24,
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    paddingBottom: 16,
  },
  subHeader: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    marginTop: 8,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingDesc: {
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  numberInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  accountActions: {
    flexDirection: 'row',
    gap: 8,
  },
  accountName: {
    fontSize: 17,
    fontWeight: '700',
  },
  accountUrl: {
    fontSize: 13,
    marginTop: 4,
  },
  smallBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 50,
  },
  smallBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 50,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  formControl: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  btnPrimary: {
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  btnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  ispBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
    borderWidth: 1,
  },
  ispBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  ispGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  ispOption: {
    width: '48%',
    padding: 12,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
  },
  ispOptionText: {
    fontWeight: '500',
  },
  otherText: {
    fontSize: 14,
  },
});
