import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Method_definition } from './method_definition.entity';

@Entity('setting_definition')
export class Setting_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "boolean", nullable: false, default: false })
    isInit: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @Column({ type: "text", nullable: true })
    projectDescription: string;
    @Column({ type: "varchar", nullable: true })
    projectName: string;
    @Column({ type: "varchar", nullable: true })
    projectUrl: string;
    @OneToMany('Method_definition', (rel: any) => rel.setting, { cascade: true })
    methods: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
