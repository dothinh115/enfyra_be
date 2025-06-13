@Entity('setting_definition')
export class Setting_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "boolean", nullable: false, default: false })
    isInit: boolean;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
