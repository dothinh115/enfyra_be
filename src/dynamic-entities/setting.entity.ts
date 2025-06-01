import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
@Entity("setting")
export class Setting {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({type:'boolean', nullable: false})
  isInit: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}